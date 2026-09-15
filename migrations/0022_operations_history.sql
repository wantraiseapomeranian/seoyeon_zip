-- One immutable aggregate per KST date; no post payloads or provider responses.
CREATE TABLE operations_history (
 day TEXT PRIMARY KEY,
 captured_at TEXT NOT NULL,
 x_total INTEGER NOT NULL CHECK(x_total>=0),
 instagram_total INTEGER NOT NULL CHECK(instagram_total>=0),
 manual_total INTEGER NOT NULL CHECK(manual_total>=0),
 database_bytes INTEGER,
 query_version TEXT NOT NULL,
 query_status TEXT NOT NULL CHECK(query_status IN ('ok','failed')),
 query_sql_ms REAL,
 query_rows_read INTEGER,
 query_result_bytes INTEGER
);
