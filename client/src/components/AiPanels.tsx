import { useState } from "react";
import type { Task } from "../lib/api.js";
import { api } from "../lib/api.js";

export function SuggestPanel({ tasks, onLinked }: { tasks: Task[]; onLinked: () => void }) {
  const [taskId, setTaskId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof api.suggestDependencies>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!taskId) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api.suggestDependencies(taskId));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function confirm(fromTaskId: string, toTaskId: string) {
    try {
      await api.createDependency(fromTaskId, toTaskId);
      onLinked();
      setResult((r) =>
        r ? { ...r, suggestions: r.suggestions.filter((s) => !(s.fromTaskId === fromTaskId && s.toTaskId === toTaskId)) } : r
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const titleOf = (id: string) => tasks.find((t) => t.id === id)?.title ?? id;

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
      <h3 className="text-sm font-semibold mb-2">Dependency suggestions</h3>
      <div className="flex gap-2 mb-2">
        <select
          value={taskId}
          onChange={(e) => setTaskId(e.target.value)}
          className="flex-1 bg-slate-800 rounded px-2 py-1.5 text-xs"
        >
          <option value="">Select a task…</option>
          {tasks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
        <button
          onClick={run}
          disabled={!taskId || loading}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs rounded px-3 py-1.5"
        >
          {loading ? "Thinking…" : "Suggest"}
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {result && !result.ok && <p className="text-xs text-amber-400">{result.message}</p>}
      {result?.ok && result.suggestions.length === 0 && (
        <p className="text-xs text-slate-500">No suggestions found.</p>
      )}
      {result?.ok &&
        result.suggestions.map((s, i) => (
          <div key={i} className="text-xs border border-slate-800 rounded p-2 mb-1.5">
            <p>
              <span className="text-slate-200">{titleOf(s.fromTaskId)}</span> →{" "}
              <span className="text-slate-200">{titleOf(s.toTaskId)}</span>
            </p>
            <p className="text-slate-500 mt-0.5">{s.reason}</p>
            {s.wouldCreateCycle ? (
              <p className="text-red-400 mt-1">⚠ Would create a cycle — cannot confirm.</p>
            ) : s.alreadyExists ? (
              <p className="text-slate-500 mt-1">Already linked.</p>
            ) : (
              <button
                onClick={() => confirm(s.fromTaskId, s.toTaskId)}
                className="mt-1 bg-emerald-600/80 hover:bg-emerald-500 rounded px-2 py-0.5"
              >
                Confirm link
              </button>
            )}
          </div>
        ))}
    </section>
  );
}

export function InvestigatorPanel() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof api.investigate>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function ask() {
    if (!question.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api.investigate(question));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
      <h3 className="text-sm font-semibold mb-2">Pre-commit impact investigator</h3>
      <div className="flex gap-2 mb-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. what happens if the database migration slips 4 days?"
          className="flex-1 bg-slate-800 rounded px-2 py-1.5 text-xs"
        />
        <button
          onClick={ask}
          disabled={loading}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs rounded px-3 py-1.5"
        >
          {loading ? "Investigating…" : "Ask"}
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {result && (
        <div className="text-xs">
          <p className="text-slate-200 whitespace-pre-wrap">{result.answer}</p>
          {result.toolCalls.length > 0 && (
            <details className="mt-2 text-slate-500">
              <summary className="cursor-pointer">{result.toolCalls.length} tool call(s) used</summary>
              <ul className="mt-1 space-y-1">
                {result.toolCalls.map((tc, i) => (
                  <li key={i} className="font-mono text-[10px]">
                    {tc.name}({JSON.stringify(tc.input)})
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
}

export function DriftPanel() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof api.driftReport>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api.driftReport());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold">Drift detector</h3>
        <button
          onClick={run}
          disabled={loading}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs rounded px-3 py-1.5"
        >
          {loading ? "Scanning…" : "Scan graph"}
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {result && !result.ok && <p className="text-xs text-amber-400">{result.message}</p>}
      {result?.ok && result.findings.length === 0 && <p className="text-xs text-slate-500">No drift found.</p>}
      {result?.ok &&
        result.findings.map((f, i) => (
          <div key={i} className="text-xs border border-slate-800 rounded p-2 mb-1.5">
            <p className="text-amber-400">{f.type.replace(/_/g, " ")}</p>
            <p className="text-slate-400 mt-0.5">{f.explanation}</p>
          </div>
        ))}
    </section>
  );
}
