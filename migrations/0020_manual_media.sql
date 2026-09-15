CREATE TABLE manual_media_jobs (
 post_id TEXT PRIMARY KEY REFERENCES manual_posts(id),
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','starting','waiting','ready','no_media','failed','existing')),
 error TEXT,
 run_id TEXT,
 lease_token TEXT,
 lease_until INTEGER NOT NULL DEFAULT 0,
 next_due_at INTEGER NOT NULL DEFAULT 0,
 started_at INTEGER,
 updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX manual_media_due ON manual_media_jobs(state,next_due_at,lease_until);
INSERT INTO manual_media_jobs(post_id) SELECT id FROM manual_posts;
-- Shortcode identity also covers /p/ versus /reel/ and retains review exclusions.
DROP VIEW managed_feed_posts;
CREATE VIEW managed_feed_posts AS
 SELECT id,data FROM feed_posts
 UNION ALL SELECT m.id,m.data FROM manual_posts m
 WHERE NOT EXISTS(SELECT 1 FROM posts p WHERE p.id=substr(m.id,8) OR json_extract(p.data,'$.canonicalUrl')=m.canonical_url)
 AND NOT EXISTS(SELECT 1 FROM instagram_review i WHERE i.code=substr(m.id,11));
