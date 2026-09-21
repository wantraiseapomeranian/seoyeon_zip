-- Run only after 0027 and the compatible Worker deployment. Re-running preserves progress/decisions.
-- Handles are resolved through the YouTube channels API before any channel-scoped search.
INSERT INTO youtube_sources(source_key,kind,query,backfill_handle,window_start,window_end,backfill_until)
SELECT 'backfill:'||handle,'search','윤서연|SEOYEON',handle,'2022-01-01T00:00:00.000Z','2024-01-01T00:00:00.000Z',strftime('%Y-%m-%dT%H:%M:%fZ','now','-30 days')
FROM (SELECT '@MnetM2' handle UNION ALL SELECT '@KBSKpop' UNION ALL SELECT '@MBCkpop' UNION ALL SELECT '@SBSKPOP_ZOOM')
WHERE true ON CONFLICT(source_key) DO NOTHING;
