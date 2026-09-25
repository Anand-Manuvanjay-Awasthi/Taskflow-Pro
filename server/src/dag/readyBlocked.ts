import type { GraphSnapshot, TaskStatus } from "./types.js";

/**
 * A task is Ready iff every direct prerequisite task is in the "done" column.
 * Tasks with no prerequisites are Ready by default.
 */
export function computeStatus(graph: GraphSnapshot, taskId: string): TaskStatus {
  const prereqs = graph.edgesTo.get(taskId) ?? [];
  for (const prereqId of prereqs) {
    const prereq = graph.tasks.get(prereqId);
    if (!prereq || prereq.column !== "done") {
      return "blocked";
    }
  }
  return "ready";
}

/**
 * Recomputes status only for the changed task and every descendant reachable
 * from it (its dependents, transitively) — not the whole graph. This is used
 * both for forward changes (a task moves to Done, unblocking children) and
 * rollback (a task leaves Done, re-blocking children).
 *
 * Returns a map of taskId -> newStatus for every task whose status was
 * (re)computed, so the caller can persist only what changed.
 */
export function recomputeAffectedDescendants(
  graph: GraphSnapshot,
  changedTaskId: string
): Map<string, TaskStatus> {
  const results = new Map<string, TaskStatus>();
  const visited = new Set<string>();
  const queue: string[] = [changedTaskId];
  visited.add(changedTaskId);

  // Include the changed task itself in case its own status needs updating too
  // (e.g. it depends on something and its own prereqs changed).
  while (queue.length > 0) {
    const current = queue.shift()!;
    results.set(current, computeStatus(graph, current));
    for (const dependent of graph.edgesFrom.get(current) ?? []) {
      if (!visited.has(dependent)) {
        visited.add(dependent);
        queue.push(dependent);
      }
    }
  }
  return results;
}
