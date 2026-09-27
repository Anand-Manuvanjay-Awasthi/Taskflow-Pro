import type { ColumnName, Task } from "../lib/api.js";
import { TaskCard } from "./TaskCard.js";

const COLUMNS: { key: ColumnName; label: string }[] = [
  { key: "backlog", label: "Backlog" },
  { key: "in_progress", label: "In Progress" },
  { key: "review", label: "Review" },
  { key: "done", label: "Done" },
];

interface Props {
  tasks: Task[];
  onMove: (taskId: string, column: ColumnName) => void;
  onSelect: (taskId: string) => void;
  selectedId: string | null;
  selectMode: boolean;
}

export function Board({ tasks, onMove, onSelect, selectedId, selectMode }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {COLUMNS.map((col) => {
        const colTasks = tasks.filter((t) => t.column === col.key);
        return (
          <div key={col.key} className="bg-slate-900/40 rounded-xl border border-slate-800 p-3 min-h-[200px]">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-slate-300">{col.label}</h2>
              <span className="text-xs text-slate-500">{colTasks.length}</span>
            </div>
            {colTasks.map((task) => (
              <div key={task.id}>
                <TaskCard
                  task={task}
                  onClick={() => onSelect(task.id)}
                  selected={selectedId === task.id}
                  selectMode={selectMode}
                />
                {!selectMode && (
                  <div className="flex gap-1 -mt-1 mb-2 flex-wrap">
                    {COLUMNS.filter((c) => c.key !== task.column).map((c) => (
                      <button
                        key={c.key}
                        onClick={() => onMove(task.id, c.key)}
                        className="text-[10px] text-slate-500 hover:text-slate-200 border border-slate-800 rounded px-1.5 py-0.5"
                      >
                        → {c.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
