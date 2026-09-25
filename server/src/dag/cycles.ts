import type { GraphSnapshot } from "./types.js";

/**
 * Checks whether adding an edge (fromTaskId -> toTaskId) — meaning
 * "toTaskId depends on fromTaskId" — would introduce a cycle.
 *
 * An edge from->to creates a cycle iff `from` is already reachable from `to`,
 * i.e. `to` is already an ancestor of `from` in the existing graph. We do a
 * BFS from `to` following the "depends on" direction (edgesFrom) and check
 * whether we ever reach `from`.
 */
export function wouldCreateCycle(
  graph: GraphSnapshot,
  fromTaskId: string,
  toTaskId: string
): boolean {
  if (fromTaskId === toTaskId) return true; // self-reference is trivially a cycle

  const visited = new Set<string>();
  const queue: string[] = [toTaskId];
  visited.add(toTaskId);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === fromTaskId) return true;
    for (const next of graph.edgesFrom.get(current) ?? []) {
      if (!visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }
  return false;
}

/**
 * Full-graph cycle check (defensive; used in tests / sanity checks). Returns
 * true if the graph as given already contains a cycle anywhere.
 */
export function graphHasCycle(graph: GraphSnapshot): boolean {
  const WHITE = 0,
    GRAY = 1,
    BLACK = 2;
  const color = new Map<string, number>();
  for (const id of graph.tasks.keys()) color.set(id, WHITE);

  function dfs(node: string): boolean {
    color.set(node, GRAY);
    for (const next of graph.edgesFrom.get(node) ?? []) {
      const c = color.get(next);
      if (c === GRAY) return true; // back edge -> cycle
      if (c === WHITE && dfs(next)) return true;
    }
    color.set(node, BLACK);
    return false;
  }

  for (const id of graph.tasks.keys()) {
    if (color.get(id) === WHITE) {
      if (dfs(id)) return true;
    }
  }
  return false;
}
