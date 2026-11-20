-- When a photo group includes a post by the official account (triplescosmos, by author, not discovery source), the feed shows
-- that post and the other copies become its "같은 사진 출처" links. Otherwise the smallest post ID still wins, as before.
-- src/x-review-query.mjs (visible) applies the same order.
DROP VIEW x_photo_rows;
CREATE VIEW x_photo_rows AS
 SELECT p.id,m.key AS position,m.value AS data,COALESCE(f.confirmed_hash,f.hash) AS hash,
 CASE WHEN COALESCE(f.confirmed_hash,f.hash) IS NULL THEN 1 ELSE ROW_NUMBER() OVER(PARTITION BY COALESCE(f.confirmed_hash,f.hash) ORDER BY lower(COALESCE(json_extract(p.data,'$.authorHandle'),''))='triplescosmos' DESC,p.id,CAST(m.key AS INTEGER)) END AS rank
 FROM x_eligible p,json_each(p.data,'$.media') m
 LEFT JOIN x_fingerprints f ON f.url=json_extract(m.value,'$.previewUrl') AND json_extract(m.value,'$.kind')='image';
