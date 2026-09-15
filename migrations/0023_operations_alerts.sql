-- Aggregate operational transitions only; no provider errors, URLs or post data.
CREATE TABLE operations_alert_monitor (
 id INTEGER PRIMARY KEY CHECK(id=1),
 checked_at INTEGER,
 last_attempt_at INTEGER,
 last_failure_at INTEGER,
 lease_token TEXT,
 lease_until INTEGER NOT NULL DEFAULT 0 CONSTRAINT operations_alert_lease_valid CHECK(lease_until>=0)
);
INSERT INTO operations_alert_monitor(id) VALUES(1);

CREATE TABLE operations_alert_state (
 key TEXT PRIMARY KEY,
 label TEXT NOT NULL,
 opened_at INTEGER,
 last_seen_at INTEGER,
 bad_since INTEGER,
 healthy_since INTEGER,
 observed_at INTEGER NOT NULL
);

CREATE TABLE operations_alert_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 key TEXT NOT NULL,
 label TEXT NOT NULL,
 type TEXT NOT NULL CHECK(type IN ('problem','recovered','stopped')),
 created_at INTEGER NOT NULL
);
