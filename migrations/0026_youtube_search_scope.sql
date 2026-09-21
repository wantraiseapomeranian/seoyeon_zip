-- Invalidate old-query page tokens and any in-flight lease before restarting the search window.
UPDATE youtube_sources SET query='트리플에스 윤서연',page_token=NULL,window_start=NULL,window_end=NULL,pages=0,lease_token=NULL,lease_until=0,revision=revision+1,next_due_at=0 WHERE source_key='search:appearance' AND query='트리플에스 서연';
