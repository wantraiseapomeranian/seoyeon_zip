ALTER TABLE collection_state ADD COLUMN next_lane TEXT NOT NULL DEFAULT 'latest' CHECK(next_lane IN ('latest','history'));
ALTER TABLE collection_state ADD COLUMN last_latest_success_at INTEGER;
ALTER TABLE collection_state ADD COLUMN history_paused INTEGER NOT NULL DEFAULT 0 CHECK(history_paused IN (0,1));
UPDATE collection_state SET history_paused=1 WHERE catchup_status IN ('gap','limited') OR pages_in_cycle>=20;
