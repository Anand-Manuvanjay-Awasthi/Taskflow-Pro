import { useState } from "react";
import type { Task } from "../lib/api.js";
import { api } from "../lib/api.js";

interface Props {
  tasks: Task[];
  onCreated: () => void;
}

/**
 * Two-click linking: pick a prerequisite task, then a dependent task.
 * Rejection (cycle / duplicate / self-reference) is shown inline via the
 * API's error message rather than a silent failure.
 */
export function DependencyLinker({ tasks, onCreated }: Props) {
  const [from, setFrom] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function pick(taskId: string) {
    setError(null);
    if (!from) {
      setFrom(taskId);
      return;
    }
    if (taskId === from) {
      setFrom(null);
      return;
    }
    setBusy(true);
    try {
      await api.createDependency(from, taskId);
      setFrom(null);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 mb-4">
      <p className="text-xs text-slate-400 mb-2">
        Link dependency: click a <span className="text-slate-200">prerequisite</span> task, then the{" "}
        <span className="text-slate-200">dependent</span> task.
        {from && <span className="text-indigo-400"> Prerequisite selected — now click the dependent task.</span>}
      </p>
      <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
        {tasks.map((t) => (
          <button
            key={t.id}
            disabled={busy}
            onClick={() => pick(t.id)}
            className={`text-xs rounded px-2 py-1 border
              ${from === t.id ? "border-indigo-400 bg-indigo-500/20" : "border-slate-700 hover:border-slate-500"}`}
          >
            {t.title}
          </button>
        ))}
      </div>
      {error && <p className="text-xs text-red-400 mt-2">⚠ {error}</p>}
    </div>
  );
}
