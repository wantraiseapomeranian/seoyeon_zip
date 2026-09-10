DROP VIEW feed_posts;
DROP VIEW instagram_feed_posts;
DROP VIEW instagram_photo_rows;
CREATE VIEW instagram_photo_rows AS
 SELECT 'ig:'||p.code AS id,m.key AS position,m.value AS url,CASE WHEN json_extract(p.data,'$.media['||m.key||'].kind')='video' THEN NULL ELSE f.hash END AS hash,p.data,p.imported_at,
 CASE WHEN f.hash IS NULL OR json_extract(p.data,'$.media['||m.key||'].kind')='video' THEN 1 ELSE ROW_NUMBER() OVER(PARTITION BY CASE WHEN json_extract(p.data,'$.media['||m.key||'].kind')='video' THEN NULL ELSE f.hash END ORDER BY p.code,CAST(m.key AS INTEGER)) END AS rank
 FROM instagram_review p,json_each(CASE WHEN COALESCE(json_array_length(p.data,'$.images'),0)>0 THEN json_extract(p.data,'$.images') WHEN json_extract(p.data,'$.image') IS NOT NULL THEN json_array(json_extract(p.data,'$.image')) ELSE '[]' END) m
 LEFT JOIN x_fingerprints f ON f.url=m.value
 WHERE p.status='kept';
CREATE VIEW instagram_feed_posts AS
 SELECT r.id,json_object('id',r.id,'platform','instagram','canonicalUrl',json_extract(r.data,'$.url'),
 'authorHandle',COALESCE(json_extract(r.data,'$.author'),''),'observedViaSource','instagram',
 'publishedAt',COALESCE(json_extract(r.data,'$.publishedAt'),r.imported_at),'dateEstimated',json_extract(r.data,'$.publishedAt') IS NULL,
 'caption',json_extract(r.data,'$.caption'),'contentKind','other','mediaCount',json_extract(r.data,'$.mediaCount'),
 'media',json_group_array(json_object('kind',COALESCE(json_extract(r.data,'$.media['||r.position||'].kind'),'unknown'),'previewUrl',r.url))) AS data
 FROM (SELECT * FROM instagram_photo_rows ORDER BY id,CAST(position AS INTEGER)) r
 WHERE r.rank=1 AND NOT EXISTS(SELECT 1 FROM x_photo_rows x WHERE x.hash=r.hash AND x.rank=1)
 GROUP BY r.id;
CREATE VIEW feed_posts AS SELECT id,data FROM x_feed_posts UNION ALL SELECT id,data FROM instagram_feed_posts;
