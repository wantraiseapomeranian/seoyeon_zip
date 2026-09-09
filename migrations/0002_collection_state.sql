CREATE TABLE collection_control (
  id INTEGER PRIMARY KEY CHECK(id=1),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
  revision INTEGER NOT NULL DEFAULT 0
);
INSERT INTO collection_control(id) VALUES(1);
CREATE TABLE collection_state (
  source TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
  revision INTEGER NOT NULL DEFAULT 0,
  next_due_at INTEGER NOT NULL DEFAULT 0,
  lease_token TEXT, lease_until INTEGER,
  last_attempt_at INTEGER, last_success_at INTEGER, last_complete_sync_at INTEGER,
  committed_boundary_at INTEGER, cycle_started_at INTEGER, cycle_boundary_at INTEGER,
  next_cursor TEXT, pages_in_cycle INTEGER NOT NULL DEFAULT 0,
  failures INTEGER NOT NULL DEFAULT 0, cursor_resets INTEGER NOT NULL DEFAULT 0,
  last_error_code TEXT,
  catchup_status TEXT NOT NULL DEFAULT 'idle'
);
CREATE INDEX collection_due ON collection_state(enabled,next_due_at,last_attempt_at);
INSERT INTO collection_state(source) VALUES
 ('gapyeonghaus'),('Seowoo_0501'),('tripleSnewsfeed'),
 ('TRIPLES_FAN_FR'),('Or1gin030806'),('First0806_');
