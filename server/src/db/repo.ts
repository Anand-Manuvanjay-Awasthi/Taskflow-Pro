import type Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";
import type { Task, Dependency, ColumnName, TaskStatus } from "../dag/types.js";

interface TaskRow {
  id: string;
  title: string;
  description: string;
  column_name: ColumnName;
  status: TaskStatus;
  start_date: string | null;
  duration: number;
  created_at: string;
  updated_at: string;
}

interface DepRow {
  id: string;
  from_task_id: string;
  to_task_id: string;
  created_at: string;
  source: "manual" | "ai_suggested";
}

function rowToTask(r: TaskRow): Task {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    column: r.column_name,
    status: r.status,
    startDate: r.start_date,
    duration: r.duration,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToDep(r: DepRow): Dependency {
  return {
    id: r.id,
    fromTaskId: r.from_task_id,
    toTaskId: r.to_task_id,
    createdAt: r.created_at,
    source: r.source,
  };
}

export class Repo {
  constructor(private db: Database.Database) {}

  // ---- reads ----

  listTasks(): Task[] {
    const rows = this.db.prepare("SELECT * FROM tasks ORDER BY created_at ASC").all() as TaskRow[];
    return rows.map(rowToTask);
  }

  getTask(id: string): Task | null {
    const row = this.db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as TaskRow | undefined;
    return row ? rowToTask(row) : null;
  }

  listDependencies(): Dependency[] {
    const rows = this.db.prepare("SELECT * FROM dependencies ORDER BY created_at ASC").all() as DepRow[];
    return rows.map(rowToDep);
  }

  // ---- writes ----

  createTask(input: {
    title: string;
    description?: string;
    column?: ColumnName;
    startDate?: string | null;
    duration?: number;
  }): Task {
    const id = uuidv4();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO tasks (id, title, description, column_name, status, start_date, duration, created_at, updated_at)
         VALUES (@id, @title, @description, @column, 'ready', @startDate, @duration, @now, @now)`
      )
      .run({
        id,
        title: input.title,
        description: input.description ?? "",
        column: input.column ?? "backlog",
        startDate: input.startDate ?? null,
        duration: input.duration ?? 1,
        now,
      });
    return this.getTask(id)!;
  }

  updateTaskColumn(id: string, column: ColumnName): void {
    this.db
      .prepare("UPDATE tasks SET column_name = ?, updated_at = ? WHERE id = ?")
      .run(column, new Date().toISOString(), id);
  }

  updateTaskStatus(id: string, status: TaskStatus): void {
    this.db
      .prepare("UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?")
      .run(status, new Date().toISOString(), id);
  }

  updateTaskSchedule(id: string, startDate: string | null): void {
    this.db
      .prepare("UPDATE tasks SET start_date = ?, updated_at = ? WHERE id = ?")
      .run(startDate, new Date().toISOString(), id);
  }

  logStateChange(taskId: string, fromStatus: string | null, toStatus: string): void {
    this.db
      .prepare(
        `INSERT INTO task_state_log (id, task_id, from_status, to_status, changed_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(uuidv4(), taskId, fromStatus, toStatus, new Date().toISOString());
  }

  createDependency(fromTaskId: string, toTaskId: string, source: "manual" | "ai_suggested" = "manual"): Dependency {
    const id = uuidv4();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO dependencies (id, from_task_id, to_task_id, created_at, source)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(id, fromTaskId, toTaskId, now, source);
    return { id, fromTaskId, toTaskId, createdAt: now, source };
  }

  dependencyExists(fromTaskId: string, toTaskId: string): boolean {
    const row = this.db
      .prepare("SELECT 1 FROM dependencies WHERE from_task_id = ? AND to_task_id = ?")
      .get(fromTaskId, toTaskId);
    return !!row;
  }
}
