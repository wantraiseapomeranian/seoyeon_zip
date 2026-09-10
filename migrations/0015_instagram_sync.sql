CREATE TABLE instagram_sync (
 id INTEGER PRIMARY KEY CHECK(id=1), task_id TEXT NOT NULL,
 discovery_offset INTEGER NOT NULL DEFAULT 0,
 lease_token TEXT, lease_until INTEGER NOT NULL DEFAULT 0,
 next_due_at INTEGER NOT NULL DEFAULT 0,
 last_checked_at TEXT, last_success_at TEXT, last_error TEXT,
 failures INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE instagram_sync_runs (
 id TEXT PRIMARY KEY, task_id TEXT NOT NULL, dataset_id TEXT NOT NULL,
 finished_at TEXT NOT NULL, item_offset INTEGER NOT NULL DEFAULT 0,
 item_count INTEGER, state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','complete')),
 next_due_at INTEGER NOT NULL DEFAULT 0, failures INTEGER NOT NULL DEFAULT 0, last_error TEXT,
 completed_at TEXT
);
CREATE INDEX instagram_sync_pending ON instagram_sync_runs(task_id,state,finished_at,id);
