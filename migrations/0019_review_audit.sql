CREATE TABLE review_audit_control (
  id INTEGER PRIMARY KEY CHECK(id=1),
  started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT INTO review_audit_control(id) VALUES(1);

CREATE TABLE review_audit_log (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE,
  request_fingerprint TEXT NOT NULL,
  platform TEXT NOT NULL CHECK(platform IN ('X','INSTAGRAM')),
  target_type TEXT NOT NULL CHECK(target_type IN ('POST','IMAGE_PAIR','IMAGE_GROUP')),
  target_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN (
    'SHOW','HIDE','RESET_AUTO','KEEP','EXCLUDE','HOLD','RESET_PENDING',
    'MARK_SAME_IMAGE','MARK_DIFFERENT_IMAGE','UNMERGE')),
  previous_state TEXT NOT NULL CHECK(json_valid(previous_state)),
  new_state TEXT NOT NULL CHECK(json_valid(new_state)),
  reason_code TEXT NOT NULL,
  note TEXT CHECK(note IS NULL OR length(note)<=1000),
  reviewed_by TEXT NOT NULL,
  reviewed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  metadata_json TEXT NOT NULL CHECK(json_valid(metadata_json))
);
CREATE INDEX review_audit_time ON review_audit_log(reviewed_at DESC,id DESC);
CREATE INDEX review_audit_target ON review_audit_log(target_type,target_id,reviewed_at DESC,id DESC);
CREATE INDEX review_audit_platform_action ON review_audit_log(platform,action,reviewed_at DESC,id DESC);
CREATE TRIGGER review_audit_no_update BEFORE UPDATE ON review_audit_log
BEGIN SELECT RAISE(ABORT,'audit_append_only'); END;
CREATE TRIGGER review_audit_no_delete BEFORE DELETE ON review_audit_log
BEGIN SELECT RAISE(ABORT,'audit_append_only'); END;

ALTER TABLE x_fingerprints ADD COLUMN candidate_metadata_json TEXT;
