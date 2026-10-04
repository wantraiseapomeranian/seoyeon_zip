CREATE TABLE provider_retry_state (
  host TEXT PRIMARY KEY,
  next_due_at INTEGER NOT NULL DEFAULT 0,
  rate_limit_failures INTEGER NOT NULL DEFAULT 0,
  lease_token TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0
);

INSERT INTO provider_retry_state(host,next_due_at,rate_limit_failures)
SELECT 'api.fxtwitter.com',COALESCE(MAX(next_due_at),0),CASE WHEN COUNT(*)>0 THEN 1 ELSE 0 END
FROM collection_state
WHERE last_error_code IN ('provider_http_error:429','provider_json_error:429','rate_limited')
  AND next_due_at>unixepoch();

ALTER TABLE collection_state ADD COLUMN not_found_failures INTEGER NOT NULL DEFAULT 0;

UPDATE collection_state SET
  not_found_failures=failures,
  failures=0,
  next_due_at=MIN(next_due_at,COALESCE(last_attempt_at,unixepoch())+1800)
WHERE last_error_code IN ('provider_http_error:404','provider_json_error:404');

UPDATE collection_state SET failures=0
WHERE last_error_code IN ('provider_http_error:429','provider_json_error:429','rate_limited');
