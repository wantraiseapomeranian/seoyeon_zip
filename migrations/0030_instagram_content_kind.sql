-- Read the normalized content kind without changing moderation or media rules.
DROP VIEW instagram_feed_posts;
CREATE VIEW instagram_feed_posts AS
 SELECT r.id,json_object('id',r.id,'platform','instagram','canonicalUrl',json_extract(r.data,'$.url'),
 'authorHandle',COALESCE(json_extract(r.data,'$.author'),''),'observedViaSource','instagram',
 'publishedAt',COALESCE(json_extract(r.data,'$.publishedAt'),r.imported_at),'dateEstimated',json_extract(r.data,'$.publishedAt') IS NULL,
 'caption',json_extract(r.data,'$.caption'),'contentKind',CASE WHEN json_extract(r.data,'$.contentKind') IN ('cosmo','fansite','official') THEN json_extract(r.data,'$.contentKind') ELSE 'other' END,'mediaCount',json_extract(r.data,'$.mediaCount'),
 'media',json_group_array(json_object('kind',COALESCE(json_extract(r.data,'$.media['||r.position||'].kind'),'unknown'),'previewUrl',r.url))) AS data
 FROM (SELECT * FROM instagram_photo_rows ORDER BY id,CAST(position AS INTEGER)) r
 WHERE r.rank=1 AND NOT EXISTS(SELECT 1 FROM x_photo_rows x WHERE x.hash=r.hash AND x.rank=1)
 GROUP BY r.id;
