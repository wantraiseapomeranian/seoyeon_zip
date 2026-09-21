-- Preserve all videos and discovery references while expanding the category CHECK.
PRAGMA defer_foreign_keys=ON;
DROP VIEW managed_feed_posts;
DROP VIEW youtube_feed_posts;
CREATE TABLE youtube_videos_expanded (
 video_id TEXT PRIMARY KEY CHECK(length(video_id)=11), metadata_json TEXT CHECK(metadata_json IS NULL OR json_valid(metadata_json)),
 metadata_fetched_at INTEGER NOT NULL DEFAULT 0, availability TEXT NOT NULL DEFAULT 'available' CHECK(availability IN ('available','unavailable','expired')),
 decision TEXT NOT NULL DEFAULT 'pending' CHECK(decision IN ('pending','kept','excluded','held')),
 category TEXT CHECK(category IN ('fancam','appearance','cosmo_live','official','other')), format TEXT NOT NULL DEFAULT 'unknown' CHECK(format IN ('unknown','regular','shorts')),
 manual INTEGER NOT NULL DEFAULT 0, revision INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), reviewed_at TEXT,
 CHECK(decision!='kept' OR (format='regular' AND category IS NOT NULL))
);

INSERT INTO youtube_videos_expanded SELECT * FROM youtube_videos;
DROP TABLE youtube_videos;
ALTER TABLE youtube_videos_expanded RENAME TO youtube_videos;
CREATE INDEX youtube_review_page ON youtube_videos(decision,created_at DESC,video_id);
CREATE INDEX youtube_refresh_due ON youtube_videos(metadata_fetched_at,video_id);
CREATE VIEW youtube_feed_posts AS SELECT 'yt:'||video_id id,json_object(
 'id','yt:'||video_id,'platform','youtube','platformPostId',video_id,'canonicalUrl','https://www.youtube.com/watch?v='||video_id,
 'title',json_extract(metadata_json,'$.title'),'channelTitle',json_extract(metadata_json,'$.channelTitle'),'durationSeconds',json_extract(metadata_json,'$.durationSeconds'),
 'authorHandle',json_extract(metadata_json,'$.channelTitle'),'publishedAt',json_extract(metadata_json,'$.publishedAt'),
 'observedViaSource','youtube','contentKind','other','caption',json_extract(metadata_json,'$.title'),'manual',json(CASE WHEN manual=1 THEN 'true' ELSE 'false' END),
 'media',json_array(json_object('kind','video','previewUrl',json_extract(metadata_json,'$.thumbnailUrl')))
 ) data FROM youtube_videos WHERE decision='kept' AND format='regular' AND category IS NOT NULL AND availability='available' AND metadata_json IS NOT NULL AND metadata_fetched_at>unixepoch()-2592000;

CREATE VIEW managed_feed_posts AS
 SELECT id,data FROM feed_posts
 UNION ALL SELECT m.id,m.data FROM manual_posts m
 WHERE NOT EXISTS(SELECT 1 FROM posts p WHERE p.id=substr(m.id,8) OR json_extract(p.data,'$.canonicalUrl')=m.canonical_url)
 AND NOT EXISTS(SELECT 1 FROM instagram_review i WHERE i.code=substr(m.id,11))
 UNION ALL SELECT id,data FROM youtube_feed_posts;

PRAGMA defer_foreign_keys=OFF;
