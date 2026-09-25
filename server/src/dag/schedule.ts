import type { GraphSnapshot } from "./types.js";

export interface ScheduleShiftResult {
  taskId: string;
  oldStartDate: string | null;
  newStartDate: string | null;
  shiftDays: number;
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Collects every task reachable from `sourceId` following dependent edges
 * (i.e. every downstream descendant, transitively), including the source
 * itself.
 */
function collectDescendants(graph: GraphSnapshot, sourceId: string): Set<string> {
  const visited = new Set<string>([sourceId]);
  const queue = [sourceId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of graph.edgesFrom.get(current) ?? []) {
      if (!visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }
  return visited;
}

/**
 * Kahn's-algorithm topological sort restricted to the given node subset,
 * using only edges whose both endpoints are inside the subset.
 */
function topoSortSubset(graph: GraphSnapshot, subset: Set<string>): string[] {
  const inDegree = new Map<string, number>();
  for (const id of subset) inDegree.set(id, 0);
  for (const id of subset) {
    for (const next of graph.edgesFrom.get(id) ?? []) {
      if (subset.has(next)) {
        inDegree.set(next, (inDegree.get(next) ?? 0) + 1);
      }
    }
  }
  const queue: string[] = [...subset].filter((id) => inDegree.get(id) === 0);
  const order: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    order.push(current);
    for (const next of graph.edgesFrom.get(current) ?? []) {
      if (!subset.has(next)) continue;
      const deg = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, deg);
      if (deg === 0) queue.push(next);
    }
  }
  return order;
}

/**
 * Propagates a schedule shift (in days, positive = pushed out, negative =
 * pulled in) starting at `sourceId`, WITHOUT compounding across converging
 * (diamond) paths: a node's net shift is the MAX shift among its incoming
 * prerequisite edges (only counting prerequisites that were themselves
 * affected), not the sum. Each node is visited and assigned a shift exactly
 * once (topological order + a cache), so a reconverging path can never be
 * applied twice.
 *
 * Returns one result per affected task (the source and all of its
 * descendants), with `shiftDays` for unaffected-but-in-subgraph nodes
 * possibly 0 if none of their prerequisites actually moved.
 */
export function propagateScheduleShift(
  graph: GraphSnapshot,
  sourceId: string,
  deltaDays: number
): ScheduleShiftResult[] {
  const descendants = collectDescendants(graph, sourceId);
  const order = topoSortSubset(graph, descendants);

  const shift = new Map<string, number>();
  shift.set(sourceId, deltaDays);

  for (const nodeId of order) {
    if (nodeId === sourceId) continue;
    const prereqs = graph.edgesTo.get(nodeId) ?? [];
    let maxShift = 0;
    for (const p of prereqs) {
      // Only prerequisites within the affected subgraph can contribute; a
      // prerequisite outside it never moved, so it contributes 0.
      const s = shift.get(p) ?? 0;
      if (s > maxShift) maxShift = s;
    }
    shift.set(nodeId, maxShift);
  }

  const results: ScheduleShiftResult[] = [];
  for (const nodeId of order) {
    const task = graph.tasks.get(nodeId);
    const shiftDays = shift.get(nodeId) ?? 0;
    const oldStartDate = task?.startDate ?? null;
    const newStartDate = oldStartDate && shiftDays !== 0 ? addDays(oldStartDate, shiftDays) : oldStartDate;
    results.push({ taskId: nodeId, oldStartDate, newStartDate, shiftDays });
  }
  return results;
}
