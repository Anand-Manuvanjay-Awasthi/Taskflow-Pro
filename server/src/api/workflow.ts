import type Database from "better-sqlite3";
import { Repo } from "../db/repo.js";
import { buildGraphSnapshot, type ColumnName, type Task, type Dependency } from "../dag/types.js";
import { wouldCreateCycle } from "../dag/cycles.js";
import { recomputeAffectedDescendants } from "../dag/readyBlocked.js";
import { propagateScheduleShift } from "../dag/schedule.js";

export class ValidationError extends Error {
  status = 400;
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}
export class NotFoundError extends Error {
  status = 404;
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

/**
 * WorkflowService is the SOLE authoritative entry point for graph mutations.
 * Both the UI (via the HTTP API) and the AI agent (via the tool layer) call
 * through here — never the repo or DAG engine directly — so cycle checks,
 * validation, and propagation can never be bypassed.
 */
export class WorkflowService {
  private repo: Repo;

  constructor(private db: Database.Database) {
    this.repo = new Repo(db);
  }

  private snapshot() {
    return buildGraphSnapshot(this.repo.listTasks(), this.repo.listDependencies());
  }

  // ---- Tasks ----

  createTask(input: { title: string; description?: string; startDate?: string | null; duration?: number }): Task {
    if (!input.title || !input.title.trim()) {
      throw new ValidationError("title is required");
    }
    if (input.duration !== undefined && (!Number.isInteger(input.duration) || input.duration < 1)) {
      throw new ValidationError("duration must be a positive integer");
    }
    const task = this.repo.createTask(input);
    this.repo.logStateChange(task.id, null, task.status);
    return task;
  }

  listTasks(): Task[] {
    return this.repo.listTasks();
  }

  getTask(id: string): Task {
    const task = this.repo.getTask(id);
    if (!task) throw new NotFoundError(`task ${id} not found`);
    return task;
  }

  /**
   * Moves a task to a new Kanban column. This is the entry point for both
   * forward transitions (e.g. -> done, which may unblock descendants) and
   * rollback transitions (e.g. done -> in_progress, which may re-block
   * descendants). Ready/Blocked status is always a *computed* property —
   * moving to "done" does not by itself make a task's dependents Ready; the
   * recompute below decides that from actual prerequisite state.
   */
  moveTaskColumn(id: string, column: ColumnName): { task: Task; recomputed: { taskId: string; status: string }[] } {
    const existing = this.getTask(id);
    const validColumns: ColumnName[] = ["backlog", "in_progress", "review", "done"];
    if (!validColumns.includes(column)) {
      throw new ValidationError(`invalid column: ${column}`);
    }
    this.repo.updateTaskColumn(id, column);

    const graph = this.snapshot();
    const recomputed = recomputeAffectedDescendants(graph, id);
    for (const [taskId, status] of recomputed) {
      const before = this.repo.getTask(taskId)!;
      if (before.status !== status) {
        this.repo.updateTaskStatus(taskId, status);
        this.repo.logStateChange(taskId, before.status, status);
      }
    }
    return {
      task: this.getTask(id),
      recomputed: [...recomputed.entries()].map(([taskId, status]) => ({ taskId, status })),
    };
  }

  // ---- Dependencies ----

  createDependency(
    fromTaskId: string,
    toTaskId: string,
    source: "manual" | "ai_suggested" = "manual"
  ): Dependency {
    if (fromTaskId === toTaskId) {
      throw new ValidationError("a task cannot depend on itself");
    }
    // existence checks
    this.getTask(fromTaskId);
    this.getTask(toTaskId);

    if (this.repo.dependencyExists(fromTaskId, toTaskId)) {
      throw new ValidationError("this dependency already exists");
    }

    const graph = this.snapshot();
    if (wouldCreateCycle(graph, fromTaskId, toTaskId)) {
      throw new ValidationError(
        `adding this dependency would create a cycle (${toTaskId} is already an ancestor of ${fromTaskId})`
      );
    }

    const dependency = this.repo.createDependency(fromTaskId, toTaskId, source);

    // A new prerequisite can only ever make the dependent MORE blocked, but
    // we recompute anyway so status stays authoritative and consistent.
    const graphAfter = this.snapshot();
    const recomputed = recomputeAffectedDescendants(graphAfter, toTaskId);
    for (const [taskId, status] of recomputed) {
      const before = this.repo.getTask(taskId)!;
      if (before.status !== status) {
        this.repo.updateTaskStatus(taskId, status);
        this.repo.logStateChange(taskId, before.status, status);
      }
    }
    return dependency;
  }

  listDependencies(): Dependency[] {
    return this.repo.listDependencies();
  }

  wouldCreateCycle(fromTaskId: string, toTaskId: string): boolean {
    return wouldCreateCycle(this.snapshot(), fromTaskId, toTaskId);
  }

  // ---- Scheduling ----

  /**
   * Actually shifts a task's schedule and propagates the change downstream
   * (no compounding across diamonds), persisting new start dates.
   */
  shiftSchedule(taskId: string, deltaDays: number) {
    this.getTask(taskId);
    if (!Number.isInteger(deltaDays)) {
      throw new ValidationError("deltaDays must be an integer");
    }
    const graph = this.snapshot();
    const results = propagateScheduleShift(graph, taskId, deltaDays);
    for (const r of results) {
      if (r.shiftDays !== 0 && r.newStartDate !== r.oldStartDate) {
        this.repo.updateTaskSchedule(r.taskId, r.newStartDate);
      }
    }
    return results;
  }

  /**
   * Read-only what-if: computes the propagation result WITHOUT persisting
   * anything. Used by the Pre-Commit Impact Investigator tool.
   */
  simulateScheduleChange(taskId: string, deltaDays: number) {
    this.getTask(taskId);
    const graph = this.snapshot();
    return propagateScheduleShift(graph, taskId, deltaDays);
  }

  // ---- Graph queries (used by UI + AI tool layer) ----

  getUpstreamTasks(taskId: string): Task[] {
    const graph = this.snapshot();
    const visited = new Set<string>();
    const queue = [...(graph.edgesTo.get(taskId) ?? [])];
    while (queue.length) {
      const cur = queue.shift()!;
      if (visited.has(cur)) continue;
      visited.add(cur);
      for (const p of graph.edgesTo.get(cur) ?? []) queue.push(p);
    }
    return [...visited].map((id) => graph.tasks.get(id)!).filter(Boolean);
  }

  getDownstreamTasks(taskId: string): Task[] {
    const graph = this.snapshot();
    const visited = new Set<string>();
    const queue = [...(graph.edgesFrom.get(taskId) ?? [])];
    while (queue.length) {
      const cur = queue.shift()!;
      if (visited.has(cur)) continue;
      visited.add(cur);
      for (const n of graph.edgesFrom.get(cur) ?? []) queue.push(n);
    }
    return [...visited].map((id) => graph.tasks.get(id)!).filter(Boolean);
  }

  getBlockedTasks(): Task[] {
    return this.repo.listTasks().filter((t) => t.status === "blocked");
  }

  getTaskDependencies(taskId: string): { upstream: Task[]; downstream: Task[] } {
    return { upstream: this.getUpstreamTasks(taskId), downstream: this.getDownstreamTasks(taskId) };
  }

  /** Longest path (critical path) via topological DP over durations. */
  getCriticalPath(): { path: string[]; totalDuration: number } {
    const graph = this.snapshot();
    const ids = [...graph.tasks.keys()];
    const inDegree = new Map(ids.map((id) => [id, 0]));
    for (const id of ids) for (const n of graph.edgesFrom.get(id) ?? []) inDegree.set(n, (inDegree.get(n) ?? 0) + 1);
    const queue = ids.filter((id) => inDegree.get(id) === 0);
    const order: string[] = [];
    while (queue.length) {
      const cur = queue.shift()!;
      order.push(cur);
      for (const n of graph.edgesFrom.get(cur) ?? []) {
        const d = (inDegree.get(n) ?? 0) - 1;
        inDegree.set(n, d);
        if (d === 0) queue.push(n);
      }
    }
    const best = new Map<string, number>();
    const prev = new Map<string, string | null>();
    for (const id of order) {
      const dur = graph.tasks.get(id)!.duration;
      const prereqs = graph.edgesTo.get(id) ?? [];
      let bestPrev: string | null = null;
      let bestVal = 0;
      for (const p of prereqs) {
        const v = best.get(p) ?? 0;
        if (v > bestVal) {
          bestVal = v;
          bestPrev = p;
        }
      }
      best.set(id, bestVal + dur);
      prev.set(id, bestPrev);
    }
    let endNode: string | null = null;
    let max = 0;
    for (const [id, v] of best) {
      if (v > max) {
        max = v;
        endNode = id;
      }
    }
    const path: string[] = [];
    let cursor = endNode;
    while (cursor) {
      path.unshift(cursor);
      cursor = prev.get(cursor) ?? null;
    }
    return { path, totalDuration: max };
  }
}
