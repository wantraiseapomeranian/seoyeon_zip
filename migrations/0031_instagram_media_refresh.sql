-- Paid starts are reserved durably before contacting Apify. Ambiguous starts need operator recovery.
CREATE TABLE instagram_media_refresh (
 id INTEGER PRIMARY KEY CHECK(id=1),
 state TEXT NOT NULL DEFAULT 'idle' CHECK(state IN ('idle','starting','waiting','error')),
 run_id TEXT,codes_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(codes_json)),
 started_at INTEGER,last_success_at INTEGER,last_error TEXT,
 next_due_at INTEGER NOT NULL DEFAULT 0,failures INTEGER NOT NULL DEFAULT 0,
 lease_token TEXT,lease_until INTEGER NOT NULL DEFAULT 0,
 budget_day INTEGER NOT NULL DEFAULT -1,starts_today INTEGER NOT NULL DEFAULT 0 CHECK(starts_today BETWEEN 0 AND 2)
);
INSERT INTO instagram_media_refresh(id) VALUES(1);
CREATE TABLE instagram_media_refresh_posts (
 code TEXT PRIMARY KEY REFERENCES instagram_review(code),
 next_due_at INTEGER NOT NULL DEFAULT 0,last_success_at INTEGER,
 failures INTEGER NOT NULL DEFAULT 0,last_error TEXT
);
CREATE INDEX instagram_media_refresh_due ON instagram_media_refresh_posts(next_due_at,code);
