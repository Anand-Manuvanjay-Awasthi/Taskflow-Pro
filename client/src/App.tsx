import { useCallback, useEffect, useState } from "react";
import type { ColumnName, Task } from "./lib/api.js";
import { api } from "./lib/api.js";
import { Board } from "./components/Board.js";
import { CreateTaskForm } from "./components/CreateTaskForm.js";
import { DependencyLinker } from "./components/DependencyLinker.js";
import { SuggestPanel, InvestigatorPanel, DriftPanel } from "./components/AiPanels.js";
import { SchedulePanel, CriticalPathPanel } from "./components/SchedulePanel.js";

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setTasks(await api.listTasks());
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Loads from the real DB on every mount, proving persistence across
  // browser refreshes rather than relying on in-memory state.
  useEffect(() => {
    refresh();
  }, [refresh]);

  async function moveTask(taskId: string, column: ColumnName) {
    await api.moveTaskColumn(taskId, column);
    refresh();
  }

  return (
    <div className="min-h-screen p-6 max-w-7xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">TaskFlow Pro</h1>
        <p className="text-sm text-slate-400">DAG-based Kanban with an agentic AI layer.</p>
      </header>

      {loadError && (
        <p className="text-sm text-red-400 mb-4">
          Couldn't reach the API ({loadError}). Is the server running on :3001?
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        <div>
          <CreateTaskForm onCreated={refresh} />
          <DependencyLinker tasks={tasks} onCreated={refresh} />
          {loading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : (
            <Board tasks={tasks} onMove={moveTask} onSelect={setSelectedId} selectedId={selectedId} selectMode={false} />
          )}
        </div>
        <aside className="space-y-4">
          <SuggestPanel tasks={tasks} onLinked={refresh} />
          <InvestigatorPanel />
          <DriftPanel />
          <SchedulePanel tasks={tasks} onApplied={refresh} />
          <CriticalPathPanel tasks={tasks} />
        </aside>
      </div>
    </div>
  );
}
