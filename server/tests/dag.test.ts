import { describe, it, expect } from "vitest";
import { buildGraphSnapshot, type Task, type Dependency } from "../src/dag/types.js";
import { wouldCreateCycle, graphHasCycle } from "../src/dag/cycles.js";
import { computeStatus, recomputeAffectedDescendants } from "../src/dag/readyBlocked.js";
import { propagateScheduleShift } from "../src/dag/schedule.js";

function task(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: id,
    description: "",
    column: "backlog",
    status: "blocked",
    startDate: "2026-01-01",
    duration: 2,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function dep(id: string, from: string, to: string): Dependency {
  return { id, fromTaskId: from, toTaskId: to, createdAt: "2026-01-01T00:00:00Z", source: "manual" };
}

describe("cycle detection", () => {
  it("rejects a direct cycle A -> B -> A", () => {
    const tasks = [task("A"), task("B")];
    const deps = [dep("d1", "A", "B")];
    const graph = buildGraphSnapshot(tasks, deps);
    // Proposing B -> A would close the cycle
    expect(wouldCreateCycle(graph, "B", "A")).toBe(true);
  });

  it("rejects a longer cycle A -> B -> C -> A", () => {
    const tasks = [task("A"), task("B"), task("C")];
    const deps = [dep("d1", "A", "B"), dep("d2", "B", "C")];
    const graph = buildGraphSnapshot(tasks, deps);
    expect(wouldCreateCycle(graph, "C", "A")).toBe(true);
  });

  it("rejects a self-referencing edge", () => {
    const tasks = [task("A")];
    const graph = buildGraphSnapshot(tasks, []);
    expect(wouldCreateCycle(graph, "A", "A")).toBe(true);
  });

  it("accepts a valid, non-cyclic edge", () => {
    const tasks = [task("A"), task("B"), task("C")];
    const deps = [dep("d1", "A", "B")];
    const graph = buildGraphSnapshot(tasks, deps);
    expect(wouldCreateCycle(graph, "A", "C")).toBe(false);
  });

  it("accepts a diamond-shaping edge without falsely flagging a cycle", () => {
    // A -> B, A -> C, want to add B -> D and C -> D (no cycle)
    const tasks = [task("A"), task("B"), task("C"), task("D")];
    const deps = [dep("d1", "A", "B"), dep("d2", "A", "C")];
    const graph = buildGraphSnapshot(tasks, deps);
    expect(wouldCreateCycle(graph, "B", "D")).toBe(false);
    expect(wouldCreateCycle(graph, "C", "D")).toBe(false);
  });

  it("graphHasCycle finds no cycle in a valid diamond", () => {
    const tasks = [task("A"), task("B"), task("C"), task("D")];
    const deps = [dep("d1", "A", "B"), dep("d2", "A", "C"), dep("d3", "B", "D"), dep("d4", "C", "D")];
    const graph = buildGraphSnapshot(tasks, deps);
    expect(graphHasCycle(graph)).toBe(false);
  });
});

describe("ready/blocked computation", () => {
  it("a task with no prerequisites is ready", () => {
    const tasks = [task("A")];
    const graph = buildGraphSnapshot(tasks, []);
    expect(computeStatus(graph, "A")).toBe("ready");
  });

  it("a task is blocked while any prerequisite is not done", () => {
    const tasks = [task("A", { column: "in_progress" }), task("B")];
    const deps = [dep("d1", "A", "B")];
    const graph = buildGraphSnapshot(tasks, deps);
    expect(computeStatus(graph, "B")).toBe("blocked");
  });

  it("a task becomes ready once all prerequisites are done", () => {
    const tasks = [task("A", { column: "done" }), task("B")];
    const deps = [dep("d1", "A", "B")];
    const graph = buildGraphSnapshot(tasks, deps);
    expect(computeStatus(graph, "B")).toBe("ready");
  });

  it("a task with two prerequisites needs BOTH done", () => {
    const tasksOneDone = [task("A", { column: "done" }), task("B", { column: "in_progress" }), task("D")];
    const deps = [dep("d1", "A", "D"), dep("d2", "B", "D")];
    const graph1 = buildGraphSnapshot(tasksOneDone, deps);
    expect(computeStatus(graph1, "D")).toBe("blocked");

    const tasksBothDone = [task("A", { column: "done" }), task("B", { column: "done" }), task("D")];
    const graph2 = buildGraphSnapshot(tasksBothDone, deps);
    expect(computeStatus(graph2, "D")).toBe("ready");
  });

  it("recomputeAffectedDescendants only touches downstream nodes", () => {
    // A -> B -> D, and an unrelated task X
    const tasks = [
      task("A", { column: "done" }),
      task("B"),
      task("D"),
      task("X"),
    ];
    const deps = [dep("d1", "A", "B"), dep("d2", "B", "D")];
    const graph = buildGraphSnapshot(tasks, deps);
    const result = recomputeAffectedDescendants(graph, "A");
    expect(result.has("A")).toBe(true);
    expect(result.has("B")).toBe(true);
    expect(result.has("D")).toBe(true);
    expect(result.has("X")).toBe(false);
  });
});

describe("diamond dependency — no compounding", () => {
  it("D shifts by the same amount as A, not double, when both B and C shift", () => {
    // A -> B -> D
    // A -> C -> D
    const tasks = [
      task("A", { startDate: "2026-01-01" }),
      task("B", { startDate: "2026-01-05" }),
      task("C", { startDate: "2026-01-05" }),
      task("D", { startDate: "2026-01-10" }),
    ];
    const deps = [
      dep("d1", "A", "B"),
      dep("d2", "A", "C"),
      dep("d3", "B", "D"),
      dep("d4", "C", "D"),
    ];
    const graph = buildGraphSnapshot(tasks, deps);
    const results = propagateScheduleShift(graph, "A", 3);
    const byId = new Map(results.map((r) => [r.taskId, r]));

    expect(byId.get("A")!.shiftDays).toBe(3);
    expect(byId.get("B")!.shiftDays).toBe(3);
    expect(byId.get("C")!.shiftDays).toBe(3);
    // The critical assertion: D must shift by 3 (max across paths), not 6 (sum).
    expect(byId.get("D")!.shiftDays).toBe(3);
    expect(byId.get("D")!.newStartDate).toBe("2026-01-13");
  });

  it("asymmetric diamond: D takes the larger of two differing upstream shifts", () => {
    // A -> B -> D (B shifts +2), C -> D (C shifts +5, unrelated to A)
    const tasks = [
      task("A", { startDate: "2026-01-01" }),
      task("B", { startDate: "2026-01-05" }),
      task("C", { startDate: "2026-01-05" }),
      task("D", { startDate: "2026-01-10" }),
    ];
    const deps = [dep("d1", "A", "B"), dep("d2", "B", "D"), dep("d3", "C", "D")];
    const graph = buildGraphSnapshot(tasks, deps);

    // Shift A by 2 -> B shifts 2 -> D should shift 2 (C didn't move, contributes 0)
    const results = propagateScheduleShift(graph, "A", 2);
    const byId = new Map(results.map((r) => [r.taskId, r]));
    expect(byId.get("D")!.shiftDays).toBe(2);
  });

  it("unrelated tasks are not included in the affected set", () => {
    const tasks = [task("A"), task("B"), task("X")];
    const deps = [dep("d1", "A", "B")];
    const graph = buildGraphSnapshot(tasks, deps);
    const results = propagateScheduleShift(graph, "A", 3);
    expect(results.find((r) => r.taskId === "X")).toBeUndefined();
  });
});

describe("rollback propagation", () => {
  it("moving a Done task back to In Progress re-blocks its dependents", () => {
    // A(done) -> B(done) -> C(backlog)
    const tasks = [
      task("A", { column: "done" }),
      task("B", { column: "done" }),
      task("C"),
    ];
    const deps = [dep("d1", "A", "B"), dep("d2", "B", "C")];
    let graph = buildGraphSnapshot(tasks, deps);

    // Before rollback: C should be ready (both A and B done)
    expect(computeStatus(graph, "C")).toBe("ready");

    // Roll B back from done -> in_progress
    const rolledBackTasks = tasks.map((t) => (t.id === "B" ? { ...t, column: "in_progress" as const } : t));
    graph = buildGraphSnapshot(rolledBackTasks, deps);
    const result = recomputeAffectedDescendants(graph, "B");

    // B's own readiness is unaffected (its prerequisite A is still done) —
    // status reflects prerequisites, not the task's own column.
    expect(result.get("B")).toBe("ready");
    expect(result.get("C")).toBe("blocked"); // C's prereq B is no longer done -> re-blocked
  });

  it("a sibling branch unaffected by rollback stays ready", () => {
    // A(done) -> B(done) -> D
    // A(done) -> C(done) -> D
    const tasks = [
      task("A", { column: "done" }),
      task("B", { column: "done" }),
      task("C", { column: "done" }),
      task("D"),
    ];
    const deps = [
      dep("d1", "A", "B"),
      dep("d2", "A", "C"),
      dep("d3", "B", "D"),
      dep("d4", "C", "D"),
    ];
    let graph = buildGraphSnapshot(tasks, deps);
    expect(computeStatus(graph, "D")).toBe("ready");

    // Roll C back — D should re-block even though B is still done, because
    // BOTH prerequisites must be done.
    const rolledBack = tasks.map((t) => (t.id === "C" ? { ...t, column: "in_progress" as const } : t));
    graph = buildGraphSnapshot(rolledBack, deps);
    const result = recomputeAffectedDescendants(graph, "C");
    expect(result.get("D")).toBe("blocked");
  });
});
