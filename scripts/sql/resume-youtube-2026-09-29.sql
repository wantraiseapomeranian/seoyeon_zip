-- Run only after the 50-call quota code is deployed. Release the observed legacy block once.
-- Retain video decisions, discovery cursors, source revisions and all budget counters.
UPDATE youtube_control SET blocked_until=0,last_error_code=NULL
WHERE id=1 AND last_error_code='quota_exceeded' AND blocked_until=1790661590
 AND refresh_until<=unixepoch()
 AND NOT EXISTS(SELECT 1 FROM youtube_sources WHERE lease_until>unixepoch())
 AND EXISTS(SELECT 1 FROM youtube_api_budget WHERE day='2026-09-27' AND bucket='search' AND calls=12)
 AND NOT EXISTS(SELECT 1 FROM youtube_api_budget WHERE day>'2026-09-27' AND bucket='search' AND calls>=50);
