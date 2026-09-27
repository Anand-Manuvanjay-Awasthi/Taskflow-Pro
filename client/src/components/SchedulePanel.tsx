import { useState } from "react";
import type { Task } from "../lib/api.js";
import { api } from "../lib/api.js";

export function SchedulePanel({ tasks, onApplied }: { tasks: Task[]; onApplied: () => void }) {
  const [taskId, setTaskId] = useState("");
  const [delta, setDelta] = useState(3);
  const [results, setResults] = useState<
    { taskId: string; oldStartDate: string | null; newStartDate: string | null; shiftDays: number }[] | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  const titleOf = (id: string) => tasks.find((t) => t.id === id)?.title ?? id;

  async function simulate() {
    if (!taskId) return;
    setError(null);
    try {
      const r = await api.simulateScheduleChange(taskId, delta);
      setResults(r.results.filter((x) => x.shiftDays !== 0 || x.taskId === taskId));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function apply() {
    if (!taskId) return;
    setError(null);
    try {
      await api.shiftSchedule(taskId, delta);
      setResults(null);
      onApplied();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
      <h3 className="text-sm font-semibold mb-2">Schedule shift (diamond-safe propagation)</h3>
      <div className="flex gap-2 mb-2">
        <select value={taskId} onChange={(e) => setTaskId(e.target.value)} className="flex-1 bg-slate-800 rounded px-2 py-1.5 text-xs">
          <option value="">Select a task…</option>
          {tasks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
        <input
          type="number"
          value={delta}
          onChange={(e) => setDelta(Number(e.target.value))}
          className="w-16 bg-slate-800 rounded px-2 py-1.5 text-xs"
          title="delta days"
        />
        <button onClick={simulate} disabled={!taskId} className="bg-slate-700 hover:bg-slate-600 text-xs rounded px-2 py-1.5">
          Simulate
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {results && (
        <div className="text-xs space-y-1">
          {results.map((r) => (
            <p key={r.taskId}>
              <span className="text-slate-200">{titleOf(r.taskId)}</span>: {r.oldStartDate} → {r.newStartDate}{" "}
              <span className="text-slate-500">({r.shiftDays >= 0 ? "+" : ""}{r.shiftDays}d)</span>
            </p>
          ))}
          <button onClick={apply} className="mt-1 bg-emerald-600/80 hover:bg-emerald-500 rounded px-2 py-1">
            Apply this shift (persists)
          </button>
        </div>
      )}
    </section>
  );
}

export function CriticalPathPanel({ tasks }: { tasks: Task[] }) {
  const [data, setData] = useState<{ path: string[]; totalDuration: number } | null>(null);
  const titleOf = (id: string) => tasks.find((t) => t.id === id)?.title ?? id;

  async function run() {
    setData(await api.criticalPath());
  }

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold">Critical path</h3>
        <button onClick={run} className="bg-indigo-600 hover:bg-indigo-500 text-xs rounded px-3 py-1.5">
          Compute
        </button>
      </div>
      {data && (
        <p className="text-xs text-slate-300">
          {data.path.map(titleOf).join(" → ") || "(no tasks)"}{" "}
          <span className="text-slate-500">· {data.totalDuration}d total</span>
        </p>
      )}
    </section>
  );
}
