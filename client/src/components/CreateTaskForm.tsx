import { useState } from "react";
import { api } from "../lib/api.js";

export function CreateTaskForm({ onCreated }: { onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [duration, setDuration] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.createTask({
        title,
        description,
        startDate: startDate || null,
        duration,
      });
      setTitle("");
      setDescription("");
      setStartDate("");
      setDuration(1);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 mb-4 space-y-2">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="New task title…"
        className="w-full bg-slate-800 rounded px-2 py-1.5 text-sm outline-none focus:ring-2 ring-indigo-500"
        required
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional — mention dependencies in words, e.g. 'blocked by X')"
        rows={2}
        className="w-full bg-slate-800 rounded px-2 py-1.5 text-xs outline-none focus:ring-2 ring-indigo-500"
      />
      <div className="flex gap-2">
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="bg-slate-800 rounded px-2 py-1.5 text-xs outline-none focus:ring-2 ring-indigo-500"
        />
        <input
          type="number"
          min={1}
          value={duration}
          onChange={(e) => setDuration(Number(e.target.value))}
          className="w-20 bg-slate-800 rounded px-2 py-1.5 text-xs outline-none focus:ring-2 ring-indigo-500"
          title="duration (days)"
        />
        <button
          type="submit"
          disabled={busy}
          className="ml-auto bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-sm font-medium rounded px-3 py-1.5"
        >
          Add task
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </form>
  );
}
