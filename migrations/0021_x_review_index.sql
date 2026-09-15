-- Derived search rows only. Original posts and review decisions remain authoritative.
CREATE TABLE x_review_posts (
 id TEXT PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
 source_order INTEGER NOT NULL,
 author TEXT, author_present INTEGER NOT NULL, published_present INTEGER NOT NULL, filter_author TEXT, published_at TEXT, published_ms INTEGER, published_month TEXT,
 content_kind TEXT, canonical_url TEXT,
 moderation_present INTEGER NOT NULL, moderated INTEGER NOT NULL,
 has_image INTEGER NOT NULL, has_video INTEGER NOT NULL, has_unknown INTEGER NOT NULL
);
CREATE INDEX x_review_author ON x_review_posts(filter_author);
CREATE INDEX x_review_date ON x_review_posts(published_ms);
CREATE INDEX x_review_month ON x_review_posts(published_month);
CREATE INDEX x_review_kind ON x_review_posts(content_kind);
CREATE TABLE x_review_media (
 post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
 position INTEGER NOT NULL, url TEXT, kind TEXT,
 PRIMARY KEY(post_id,position)
) WITHOUT ROWID;
CREATE INDEX x_review_media_url ON x_review_media(url,post_id,position);
CREATE INDEX x_review_effective_hash ON x_fingerprints(COALESCE(confirmed_hash,hash));
CREATE INDEX x_review_near_url ON x_fingerprints(near_url);

CREATE VIEW x_review_projection AS
 SELECT p.id,p.rowid AS source_order,
 json_extract(p.data,'$.authorHandle') AS author,
 json_type(p.data,'$.authorHandle') IS NOT NULL AS author_present,
 json_type(p.data,'$.publishedAt') IS NOT NULL AS published_present,
 lower(COALESCE(json_extract(p.data,'$.author'),json_extract(p.data,'$.authorHandle'),'')) AS filter_author,
 json_extract(p.data,'$.publishedAt') AS published_at,
 CAST(round((julianday(json_extract(p.data,'$.publishedAt'))-2440587.5)*86400000) AS INTEGER) AS published_ms,
 strftime('%Y-%m',json_extract(p.data,'$.publishedAt'),'+9 hours') AS published_month,
 json_extract(p.data,'$.contentKind') AS content_kind,json_extract(p.data,'$.canonicalUrl') AS canonical_url,
 json_extract(p.data,'$.moderationReason') IS NOT NULL AS moderation_present,
 CASE WHEN json_extract(p.data,'$.moderationReason') IS NULL OR json_extract(p.data,'$.moderationReason') IN ('',0) THEN 0 ELSE 1 END AS moderated,
 EXISTS(SELECT 1 FROM json_each(p.data,'$.media') m WHERE json_extract(m.value,'$.kind')='image') AS has_image,
 EXISTS(SELECT 1 FROM json_each(p.data,'$.media') m WHERE json_extract(m.value,'$.kind') IN ('video','gif')) AS has_video,
 COALESCE(json_array_length(p.data,'$.media'),0)=0 OR EXISTS(SELECT 1 FROM json_each(p.data,'$.media') m WHERE json_extract(m.value,'$.kind')='unknown') AS has_unknown
 FROM posts p;

CREATE TRIGGER x_review_post_insert AFTER INSERT ON posts BEGIN
 INSERT INTO x_review_posts SELECT * FROM x_review_projection WHERE id=NEW.id;
 INSERT INTO x_review_media SELECT NEW.id,COALESCE(CAST(m.key AS INTEGER),-1),json_extract(m.value,'$.previewUrl'),json_extract(m.value,'$.kind') FROM json_each(NEW.data,'$.media') m;
END;
CREATE TRIGGER x_review_post_update AFTER UPDATE OF data,id ON posts BEGIN
 DELETE FROM x_review_media WHERE post_id=OLD.id;
 DELETE FROM x_review_posts WHERE id=OLD.id;
 INSERT INTO x_review_posts SELECT * FROM x_review_projection WHERE id=NEW.id;
 INSERT INTO x_review_media SELECT NEW.id,COALESCE(CAST(m.key AS INTEGER),-1),json_extract(m.value,'$.previewUrl'),json_extract(m.value,'$.kind') FROM json_each(NEW.data,'$.media') m;
END;
CREATE TRIGGER x_review_post_delete AFTER DELETE ON posts BEGIN
 DELETE FROM x_review_media WHERE post_id=OLD.id;
 DELETE FROM x_review_posts WHERE id=OLD.id;
END;

INSERT INTO x_review_posts SELECT * FROM x_review_projection;
INSERT INTO x_review_media SELECT p.id,COALESCE(CAST(m.key AS INTEGER),-1),json_extract(m.value,'$.previewUrl'),json_extract(m.value,'$.kind') FROM posts p,json_each(p.data,'$.media') m;
