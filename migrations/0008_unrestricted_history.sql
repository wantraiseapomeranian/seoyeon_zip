-- Apply AFTER deploying date-unrestricted collection code.
-- Invalidate old leases and revisit skipped pages without deleting stored data.
UPDATE collection_state SET
  revision=revision+1, lease_token=NULL, lease_until=NULL,
  cycle_started_at=NULL, cycle_boundary_at=0, committed_boundary_at=NULL,
  last_complete_sync_at=NULL, next_cursor=NULL, pages_in_cycle=0,
  cursor_resets=0, history_paused=0, next_lane='latest',
  next_due_at=CASE WHEN catchup_status IN ('retry','needs_attention') THEN next_due_at ELSE unixepoch() END,
  failures=CASE WHEN catchup_status IN ('retry','needs_attention') THEN failures ELSE 0 END,
  last_error_code=CASE WHEN catchup_status IN ('retry','needs_attention') THEN last_error_code ELSE NULL END,
  catchup_status=CASE WHEN catchup_status IN ('retry','needs_attention') THEN catchup_status ELSE 'idle' END;
