-- One-time recovery of three verified transient 404 failures.
-- Exact revisions fence concurrent changes; keep failures and all checkpoints.
UPDATE collection_state
SET catchup_status='retry', next_due_at=0, revision=revision+1
WHERE (source,revision) IN (
  ('First0806_',870), ('sogeumdwarf',866), ('triplescosmos',868)
)
AND enabled=1 AND failures=1 AND last_error_code='provider_http_error:404'
AND catchup_status='needs_attention' AND lease_until IS NULL
AND EXISTS(SELECT 1 FROM collection_control WHERE id=1 AND enabled=1)
RETURNING source,revision,failures,catchup_status,next_due_at;
