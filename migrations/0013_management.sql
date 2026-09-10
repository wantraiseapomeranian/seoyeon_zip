CREATE TABLE manual_posts(id TEXT PRIMARY KEY,canonical_url TEXT NOT NULL UNIQUE,data TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE VIEW managed_feed_posts AS
 SELECT id,data FROM feed_posts
 UNION ALL SELECT m.id,m.data FROM manual_posts m
 WHERE NOT EXISTS(SELECT 1 FROM posts p WHERE p.id=substr(m.id,8) OR json_extract(p.data,'$.canonicalUrl')=m.canonical_url)
 AND NOT EXISTS(SELECT 1 FROM instagram_review i WHERE json_extract(i.data,'$.url')=m.canonical_url);
