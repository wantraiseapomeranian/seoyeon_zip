-- An Instagram photo automatically matched to an X photo (maintenance, origin instagram_auto_match) carries that X photo's
-- hash in confirmed_hash. Only those rows compare by it, so the existing feed rule (drop Instagram photos whose hash an X post
-- shows) also covers re-encoded copies while every other row keeps comparing by its own file hash as before.
DROP VIEW instagram_photo_rows;
CREATE VIEW instagram_photo_rows AS
 SELECT id,position,url,hash,data,imported_at,
 CASE WHEN hash IS NULL THEN 1 ELSE ROW_NUMBER() OVER(PARTITION BY hash ORDER BY code,CAST(position AS INTEGER)) END AS rank
 FROM (SELECT 'ig:'||p.code AS id,p.code,m.key AS position,m.value AS url,p.data,p.imported_at,
  CASE WHEN json_extract(p.data,'$.media['||m.key||'].kind')='video' THEN NULL
   WHEN json_extract(f.candidate_metadata_json,'$.origin')='instagram_auto_match' THEN COALESCE(f.confirmed_hash,f.hash)
   ELSE f.hash END AS hash
  FROM instagram_review p,json_each(CASE WHEN COALESCE(json_array_length(p.data,'$.images'),0)>0 THEN json_extract(p.data,'$.images') WHEN json_extract(p.data,'$.image') IS NOT NULL THEN json_array(json_extract(p.data,'$.image')) ELSE '[]' END) m
  LEFT JOIN x_fingerprints f ON f.url=m.value
  WHERE p.status='kept');
