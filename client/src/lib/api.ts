export type ColumnName = "backlog" | "in_progress" | "review" | "done";
export type TaskStatus = "ready" | "blocked";

export interface Task {
  id: string;
  title: string;
  description: string;
  column: ColumnName;
  status: TaskStatus;
  startDate: string | null;
  duration: number;
  createdAt: string;
  updatedAt: string;
}

export interface Dependency {
  id: string;
  fromTaskId: string;
  toTaskId: string;
  createdAt: string;
  source: "manual" | "ai_suggested";
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = typeof body?.error === "string" ? body.error : JSON.stringify(body?.error ?? body);
    throw new Error(message || `Request failed: ${res.status}`);
  }
  return body as T;
}

export const api = {
  listTasks: () => request<Task[]>("/tasks"),
  createTask: (input: { title: string; description?: string; startDate?: string | null; duration?: number }) =>
    request<Task>("/tasks", { method: "POST", body: JSON.stringify(input) }),
  moveTaskColumn: (id: string, column: ColumnName) =>
    request<{ task: Task; recomputed: { taskId: string; status: string }[] }>(`/tasks/${id}/column`, {
      method: "PATCH",
      body: JSON.stringify({ column }),
    }),
  listDependencies: () => request<Dependency[]>("/dependencies"),
  createDependency: (fromTaskId: string, toTaskId: string) =>
    request<Dependency>("/dependencies", { method: "POST", body: JSON.stringify({ fromTaskId, toTaskId }) }),
  simulateScheduleChange: (taskId: string, deltaDays: number) =>
    request<{ results: { taskId: string; oldStartDate: string | null; newStartDate: string | null; shiftDays: number }[] }>(
      `/tasks/${taskId}/simulate-schedule-change`,
      { method: "POST", body: JSON.stringify({ deltaDays }) }
    ),
  shiftSchedule: (taskId: string, deltaDays: number) =>
    request<{ results: { taskId: string; oldStartDate: string | null; newStartDate: string | null; shiftDays: number }[] }>(
      `/tasks/${taskId}/shift-schedule`,
      { method: "POST", body: JSON.stringify({ deltaDays }) }
    ),
  criticalPath: () => request<{ path: string[]; totalDuration: number }>("/critical-path"),
  suggestDependencies: (taskId: string) =>
    request<{
      ok: boolean;
      suggestions: { fromTaskId: string; toTaskId: string; reason: string; wouldCreateCycle: boolean; alreadyExists: boolean }[];
      message?: string;
    }>(`/ai/tasks/${taskId}/suggest-dependencies`, { method: "POST" }),
  investigate: (question: string) =>
    request<{ answer: string; toolCalls: { name: string; input: unknown; result: unknown }[] }>("/ai/investigate", {
      method: "POST",
      body: JSON.stringify({ question }),
    }),
  driftReport: () =>
    request<{
      ok: boolean;
      findings: { taskId: string; type: string; relatedTaskId: string | null; explanation: string }[];
      message?: string;
    }>("/ai/drift-report"),
};
