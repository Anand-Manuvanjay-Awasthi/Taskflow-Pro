CREATE TABLE IF NOT EXISTS tasks (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  column_name TEXT NOT NULL DEFAULT 'backlog'
              CHECK (column_name IN ('backlog','in_progress','review','done')),
  status      TEXT NOT NULL DEFAULT 'blocked'
              CHECK (status IN ('ready','blocked')),
  start_date  TEXT,
  duration    INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dependencies (
  id            TEXT PRIMARY KEY,
  from_task_id  TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  to_task_id    TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  source        TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ai_suggested')),
  UNIQUE(from_task_id, to_task_id)
);

CREATE TABLE IF NOT EXISTS task_state_log (
  id          TEXT PRIMARY KEY,
  task_id     TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status   TEXT NOT NULL,
  changed_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_deps_from ON dependencies(from_task_id);
CREATE INDEX IF NOT EXISTS idx_deps_to ON dependencies(to_task_id);
CREATE INDEX IF NOT EXISTS idx_log_task ON task_state_log(task_id);
