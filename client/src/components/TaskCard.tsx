import type { Task } from "../lib/api.js";

interface Props {
  task: Task;
  onClick: () => void;
  selected: boolean;
  selectMode: boolean;
}

export function TaskCard({ task, onClick, selected, selectMode }: Props) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-lg border p-3 mb-2 transition
        ${selected ? "border-indigo-400 ring-2 ring-indigo-400/40" : "border-slate-700 hover:border-slate-500"}
        ${selectMode ? "cursor-crosshair" : "cursor-pointer"}
        bg-slate-900`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium text-sm leading-snug">{task.title}</span>
        <StatusPill status={task.status} />
      </div>
      {task.description && (
        <p className="text-xs text-slate-400 mt-1 line-clamp-2">{task.description}</p>
      )}
      {task.startDate && (
        <p className="text-[11px] text-slate-500 mt-2">
          {task.startDate} · {task.duration}d
        </p>
      )}
    </button>
  );
}

function StatusPill({ status }: { status: Task["status"] }) {
  const isReady = status === "ready";
  return (
    <span
      className={`shrink-0 text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5
        ${isReady ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"}`}
    >
      {isReady ? "Ready" : "Blocked"}
    </span>
  );
}
