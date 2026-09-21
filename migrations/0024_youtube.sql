CREATE TABLE youtube_videos (
 video_id TEXT PRIMARY KEY CHECK(length(video_id)=11), metadata_json TEXT CHECK(metadata_json IS NULL OR json_valid(metadata_json)),
 metadata_fetched_at INTEGER NOT NULL DEFAULT 0, availability TEXT NOT NULL DEFAULT 'available' CHECK(availability IN ('available','unavailable','expired')),
 decision TEXT NOT NULL DEFAULT 'pending' CHECK(decision IN ('pending','kept','excluded','held')),
 category TEXT CHECK(category IN ('fancam','appearance')), format TEXT NOT NULL DEFAULT 'unknown' CHECK(format IN ('unknown','regular','shorts')),
 manual INTEGER NOT NULL DEFAULT 0, revision INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), reviewed_at TEXT,
 CHECK(decision!='kept' OR (format='regular' AND category IS NOT NULL))
);
CREATE INDEX youtube_review_page ON youtube_videos(decision,created_at DESC,video_id);
CREATE INDEX youtube_refresh_due ON youtube_videos(metadata_fetched_at,video_id);
CREATE TABLE youtube_discoveries(video_id TEXT NOT NULL REFERENCES youtube_videos(video_id),source_key TEXT NOT NULL,first_seen_at INTEGER NOT NULL,last_seen_at INTEGER NOT NULL,PRIMARY KEY(video_id,source_key));
CREATE TABLE youtube_sources(source_key TEXT PRIMARY KEY,kind TEXT NOT NULL CHECK(kind IN ('search','channel')),query TEXT NOT NULL,playlist_id TEXT,enabled INTEGER NOT NULL DEFAULT 1,next_due_at INTEGER NOT NULL DEFAULT 0,last_success_at INTEGER,window_start TEXT,window_end TEXT,page_token TEXT,lease_token TEXT,lease_until INTEGER NOT NULL DEFAULT 0,revision INTEGER NOT NULL DEFAULT 0,last_error_code TEXT,pages INTEGER NOT NULL DEFAULT 0);
INSERT INTO youtube_sources(source_key,kind,query) VALUES ('search:ko-fancam','search','윤서연 직캠'),('search:en-fancam','search','tripleS SEOYEON fancam'),('search:appearance','search','트리플에스 서연');
CREATE TABLE youtube_api_budget(day TEXT NOT NULL,bucket TEXT NOT NULL,calls INTEGER NOT NULL,PRIMARY KEY(day,bucket));
CREATE TABLE youtube_control(id INTEGER PRIMARY KEY CHECK(id=1),refresh_due_at INTEGER NOT NULL DEFAULT 0,refresh_token TEXT,refresh_until INTEGER NOT NULL DEFAULT 0,last_refresh_at INTEGER,last_error_code TEXT,blocked_until INTEGER NOT NULL DEFAULT 0);
INSERT INTO youtube_control(id) VALUES(1);
CREATE TABLE youtube_review_events(id TEXT PRIMARY KEY,request_id TEXT NOT NULL UNIQUE,fingerprint TEXT NOT NULL,video_id TEXT NOT NULL,action TEXT NOT NULL,previous_state TEXT NOT NULL,new_state TEXT NOT NULL,reviewed_by TEXT NOT NULL,reason_code TEXT NOT NULL,reviewed_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')));
CREATE INDEX youtube_events_time ON youtube_review_events(reviewed_at DESC,id DESC);
CREATE TRIGGER youtube_events_no_update BEFORE UPDATE ON youtube_review_events BEGIN SELECT RAISE(ABORT,'audit_append_only'); END;
CREATE TRIGGER youtube_events_no_delete BEFORE DELETE ON youtube_review_events BEGIN SELECT RAISE(ABORT,'audit_append_only'); END;
CREATE VIEW combined_review_audit AS
 SELECT id,request_id,request_fingerprint,platform,target_type,target_id,action,previous_state,new_state,reason_code,note,reviewed_by,reviewed_at,metadata_json FROM review_audit_log
 UNION ALL SELECT id,request_id,fingerprint,'YOUTUBE','POST','yt:'||video_id,action,previous_state,new_state,reason_code,NULL,reviewed_by,reviewed_at,json_object('url','https://www.youtube.com/watch?v='||video_id) FROM youtube_review_events;
CREATE VIEW youtube_feed_posts AS SELECT 'yt:'||video_id id,json_object(
 'id','yt:'||video_id,'platform','youtube','platformPostId',video_id,'canonicalUrl','https://www.youtube.com/watch?v='||video_id,
 'title',json_extract(metadata_json,'$.title'),'channelTitle',json_extract(metadata_json,'$.channelTitle'),'durationSeconds',json_extract(metadata_json,'$.durationSeconds'),
 'authorHandle',json_extract(metadata_json,'$.channelTitle'),'publishedAt',json_extract(metadata_json,'$.publishedAt'),
 'observedViaSource','youtube','contentKind','other','caption',json_extract(metadata_json,'$.title'),'manual',json(CASE WHEN manual=1 THEN 'true' ELSE 'false' END),
 'media',json_array(json_object('kind','video','previewUrl',json_extract(metadata_json,'$.thumbnailUrl')))
 ) data FROM youtube_videos WHERE decision='kept' AND format='regular' AND category IS NOT NULL AND availability='available' AND metadata_json IS NOT NULL AND metadata_fetched_at>unixepoch()-2592000;
DROP VIEW managed_feed_posts;
CREATE VIEW managed_feed_posts AS
 SELECT id,data FROM feed_posts
 UNION ALL SELECT m.id,m.data FROM manual_posts m
 WHERE NOT EXISTS(SELECT 1 FROM posts p WHERE p.id=substr(m.id,8) OR json_extract(p.data,'$.canonicalUrl')=m.canonical_url)
 AND NOT EXISTS(SELECT 1 FROM instagram_review i WHERE i.code=substr(m.id,11))
 UNION ALL SELECT id,data FROM youtube_feed_posts;
