CREATE TABLE x_group_control(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL DEFAULT 0);
INSERT INTO x_group_control(id) VALUES(1);
CREATE TABLE x_quality (
 post_id TEXT PRIMARY KEY REFERENCES posts(id),
 decision TEXT NOT NULL DEFAULT 'auto' CHECK(decision IN ('auto','visible','hidden')),
 revision INTEGER NOT NULL DEFAULT 0,
 availability TEXT NOT NULL DEFAULT 'unknown',
 missing_count INTEGER NOT NULL DEFAULT 0,
 checked_at INTEGER,
 next_check INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE x_fingerprints (
 url TEXT PRIMARY KEY, hash TEXT, confirmed_hash TEXT, dhash TEXT, width INTEGER, height INTEGER,
 near_url TEXT, error TEXT, next_check INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX x_fingerprint_hash ON x_fingerprints(hash);
CREATE TABLE x_maintenance(id INTEGER PRIMARY KEY,token TEXT,until_at INTEGER NOT NULL DEFAULT 0);
INSERT INTO x_maintenance(id) VALUES(1);
CREATE VIEW x_eligible AS
 SELECT p.* FROM posts p LEFT JOIN x_quality q ON q.post_id=p.id
 WHERE COALESCE(q.availability,'unknown')!='missing'
 AND COALESCE(q.decision,'auto')!='hidden'
 AND (q.decision='visible' OR json_extract(p.data,'$.moderationReason') IS NULL);
CREATE VIEW x_photo_rows AS
 SELECT p.id,m.key AS position,m.value AS data,COALESCE(f.confirmed_hash,f.hash) AS hash,
 CASE WHEN COALESCE(f.confirmed_hash,f.hash) IS NULL THEN 1 ELSE ROW_NUMBER() OVER(PARTITION BY COALESCE(f.confirmed_hash,f.hash) ORDER BY p.id,CAST(m.key AS INTEGER)) END AS rank
 FROM x_eligible p,json_each(p.data,'$.media') m
 LEFT JOIN x_fingerprints f ON f.url=json_extract(m.value,'$.previewUrl') AND json_extract(m.value,'$.kind')='image';
CREATE VIEW x_feed_posts AS
 SELECT p.id,json_set(p.data,'$.media',json((SELECT json_group_array(json(m.data)) FROM x_photo_rows m WHERE m.id=p.id AND m.rank=1))) AS data
 FROM x_eligible p WHERE EXISTS(SELECT 1 FROM x_photo_rows m WHERE m.id=p.id AND m.rank=1);
