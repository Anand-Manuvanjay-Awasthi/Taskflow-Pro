export type ColumnName = "backlog" | "in_progress" | "review" | "done";
export type TaskStatus = "ready" | "blocked";

export interface Task {
  id: string;
  title: string;
  description: string;
  column: ColumnName;
  status: TaskStatus;
  startDate: string | null; // ISO date
  duration: number; // days
  createdAt: string;
  updatedAt: string;
}

export interface Dependency {
  id: string;
  fromTaskId: string; // prerequisite
  toTaskId: string; // dependent
  createdAt: string;
  source: "manual" | "ai_suggested";
}

/**
 * Minimal graph shape the pure DAG algorithms operate on. Keeping the
 * algorithms decoupled from the DB layer makes them trivial to unit test.
 */
export interface GraphSnapshot {
  tasks: Map<string, Task>;
  // adjacency: prerequisite -> [dependents]
  edgesFrom: Map<string, string[]>;
  // reverse adjacency: dependent -> [prerequisites]
  edgesTo: Map<string, string[]>;
}

export function buildGraphSnapshot(tasks: Task[], deps: Dependency[]): GraphSnapshot {
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const edgesFrom = new Map<string, string[]>();
  const edgesTo = new Map<string, string[]>();
  for (const t of tasks) {
    edgesFrom.set(t.id, []);
    edgesTo.set(t.id, []);
  }
  for (const d of deps) {
    edgesFrom.get(d.fromTaskId)?.push(d.toTaskId);
    edgesTo.get(d.toTaskId)?.push(d.fromTaskId);
  }
  return { tasks: taskMap, edgesFrom, edgesTo };
}
