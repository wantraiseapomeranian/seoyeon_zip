CREATE TABLE official_review (
 post_id TEXT PRIMARY KEY,
 source TEXT NOT NULL,
 reason TEXT NOT NULL,
 rule_version TEXT NOT NULL,
 data TEXT NOT NULL,
 first_seen_at INTEGER NOT NULL DEFAULT (unixepoch()),
 last_seen_at INTEGER NOT NULL DEFAULT (unixepoch())
);
INSERT OR IGNORE INTO collection_state(source) VALUES ('triplescosmos');
