-- Stage-0 metadata only; no media binaries or credentials.
CREATE TABLE posts(id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE media(post_id TEXT NOT NULL REFERENCES posts(id), position INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(post_id,position));
CREATE TABLE discoveries(post_id TEXT NOT NULL REFERENCES posts(id), source TEXT NOT NULL, PRIMARY KEY(post_id,source));
CREATE TABLE source_state(source TEXT PRIMARY KEY, cursor TEXT, revision INTEGER NOT NULL);
CREATE TABLE commit_guard(token TEXT PRIMARY KEY, ok INTEGER NOT NULL CHECK(ok=1));
CREATE TABLE runs(id TEXT PRIMARY KEY, finished_at TEXT NOT NULL, data TEXT NOT NULL);
