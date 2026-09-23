import {reviewFilters} from './review-filters.mjs';
import {publishedDayRange} from './published-day.mjs';

// Global classification reads compact indexed rows, never post bodies or an all-photo pair product.
const classification=`WITH
 eligible AS MATERIALIZED (
  SELECT p.id FROM x_review_posts p LEFT JOIN x_quality q ON q.post_id=p.id
  WHERE COALESCE(q.availability,'unknown')!='missing' AND COALESCE(q.decision,'auto')!='hidden'
   AND (q.decision='visible' OR p.moderation_present=0)
 ),
 visible AS MATERIALIZED (
  SELECT e.id FROM eligible e WHERE EXISTS(
   SELECT 1 FROM x_review_media m LEFT JOIN x_fingerprints f ON f.url=m.url AND m.kind='image'
   WHERE m.post_id=e.id AND (COALESCE(f.confirmed_hash,f.hash) IS NULL OR NOT EXISTS(
    SELECT 1 FROM x_fingerprints other INDEXED BY x_review_effective_hash
    CROSS JOIN x_review_media b INDEXED BY x_review_media_url ON b.url=other.url AND b.kind='image' AND b.post_id<e.id
    CROSS JOIN eligible earlier ON earlier.id=b.post_id
    WHERE COALESCE(other.confirmed_hash,other.hash)=COALESCE(f.confirmed_hash,f.hash)
   ))
  )
 ),
 near_edges AS MATERIALIZED (
  SELECT a.url AS left_url,b.url AS right_url FROM x_fingerprints a INDEXED BY x_review_near_url CROSS JOIN x_fingerprints b ON b.url=a.near_url
  WHERE a.near_url IS NOT NULL AND a.hash IS NOT NULL AND b.hash IS NOT NULL AND COALESCE(a.confirmed_hash,a.hash)!=COALESCE(b.confirmed_hash,b.hash)
   AND NOT EXISTS(SELECT 1 FROM x_photo_differences d WHERE d.left_url=min(a.url,b.url) AND d.right_url=max(a.url,b.url))
 ),
 pending AS MATERIALIZED (
  SELECT a.post_id AS id FROM near_edges n CROSS JOIN x_review_media a INDEXED BY x_review_media_url ON a.url=n.left_url
   WHERE EXISTS(SELECT 1 FROM x_review_media b WHERE b.url=n.right_url AND b.post_id!=a.post_id)
  UNION
  SELECT b.post_id AS id FROM near_edges n CROSS JOIN x_review_media b INDEXED BY x_review_media_url ON b.url=n.right_url
   WHERE EXISTS(SELECT 1 FROM x_review_media a WHERE a.url=n.left_url AND a.post_id!=b.post_id)
 ),
 states AS NOT MATERIALIZED (
  SELECT p.*,COALESCE(q.decision,'auto') AS decision,COALESCE(q.revision,0) AS revision,
   COALESCE(q.availability,'unknown') AS availability,q.checked_at,q.missing_count,
   v.id IS NOT NULL AS visible,
   CASE WHEN COALESCE(q.decision,'auto')='auto' AND (p.moderated=1 OR n.id IS NOT NULL) THEN 'pending'
    WHEN v.id IS NOT NULL THEN 'visible' ELSE 'hidden' END AS review_state,
   (COALESCE(q.availability,'')='missing' OR COALESCE(q.decision,'auto')='hidden' OR p.moderation_present=1) AS priority
  FROM x_review_posts p LEFT JOIN x_quality q ON q.post_id=p.id LEFT JOIN visible v ON v.id=p.id LEFT JOIN pending n ON n.id=p.id
 )`;
const ordering='priority DESC,published_at DESC,id';

function queryScope(params){
 reviewFilters(params); // Keep shared validation and date-over-month precedence.
 const where=[],args=[];
 const day=params.get('date'),month=params.get('month'),author=params.get('author'),kind=params.get('kind'),media=params.get('media');
 if(day){const [from,to]=publishedDayRange(day);where.push('published_ms>=? AND published_ms<?');args.push(Date.parse(from),Date.parse(to));}
 else if(month){where.push('published_month=?');args.push(month);}
 if(author){where.push('filter_author=?');args.push(author.toLowerCase());}
 if(kind&&kind!=='all'){where.push('content_kind=?');args.push(kind);}
 if(media&&media!=='all')where.push({image:'has_image=1',video:'has_video=1',unknown:'has_unknown=1'}[media]);
 return {where:where.length?where.join(' AND '):'1',args};
}

export async function readXReview(DB,params,onMeasurement){
 const status=params.get('status')??'pending',offset=Number(params.get('offset')??0);
 if(!['pending','visible','hidden','all'].includes(status)||!Number.isSafeInteger(offset)||offset<0||offset>100000)throw Error('invalid_query');
 const scope=queryScope(params);
 const pageCTE=classification+`,scoped AS MATERIALIZED (SELECT * FROM states WHERE ${scope.where}),page AS MATERIALIZED (SELECT * FROM scoped WHERE (?='all' OR review_state=?) ORDER BY ${ordering} LIMIT 25 OFFSET ?)`;
 const pageArgs=[...scope.args,status,status,offset];
 const comparisonSQL=pageCTE+`,
 own AS MATERIALIZED (
  SELECT m.post_id,m.position,m.url,COALESCE(f.confirmed_hash,f.hash) AS hash,f.near_url
  FROM page p CROSS JOIN x_review_media m ON m.post_id=p.id CROSS JOIN x_fingerprints f ON f.url=m.url WHERE f.hash IS NOT NULL
 ),
 candidate_urls AS MATERIALIZED (
  SELECT a.post_id,a.position,a.url AS own_image,a.hash AS own_hash,b.url AS other_image
   FROM own a CROSS JOIN x_fingerprints b INDEXED BY x_review_effective_hash ON COALESCE(b.confirmed_hash,b.hash)=a.hash WHERE a.hash!='' AND b.hash IS NOT NULL
  UNION
  SELECT a.post_id,a.position,a.url,a.hash,b.url FROM own a CROSS JOIN x_fingerprints b ON b.url=a.near_url WHERE b.hash IS NOT NULL
  UNION
  SELECT a.post_id,a.position,a.url,a.hash,b.url FROM own a CROSS JOIN x_fingerprints b INDEXED BY x_review_near_url ON b.near_url=a.url WHERE b.hash IS NOT NULL
 ),pairs AS (
 SELECT c.post_id AS own_id,c.position AS own_position,s.source_order AS other_order,b.position AS other_position,c.own_image,b.post_id,s.canonical_url AS url,b.url AS image,
  c.own_hash=COALESCE(f.confirmed_hash,f.hash) AS exact,s.author,s.author_present,s.published_at,s.published_present,s.visible,s.decision,s.revision
 FROM candidate_urls c CROSS JOIN x_review_media b INDEXED BY x_review_media_url ON b.url=c.other_image AND b.post_id!=c.post_id
 CROSS JOIN x_fingerprints f ON f.url=b.url CROSS JOIN states s ON s.id=b.post_id
 WHERE c.own_hash=COALESCE(f.confirmed_hash,f.hash) OR NOT EXISTS(SELECT 1 FROM x_photo_differences d WHERE d.left_url=min(c.own_image,b.url) AND d.right_url=max(c.own_image,b.url))
 ORDER BY c.post_id,c.position,s.source_order,b.position)`;
 // A single statement shares classification and a consistent snapshot across all response parts.
 const pack=columns=>'json_object('+columns.split(',').map(column=>"'"+column+"',"+column).join(',')+')';
 const packedPage=pack('data,decision,revision,availability,checked_at,missing_count,visible,review_state');
 const packedPair=pack('own_id,own_image,post_id,url,image,exact,author,author_present,published_at,published_present,visible,decision,revision');
 // Return small typed rows: one large JSON cell would hit D1's per-value limit for dense groups.
 const result=await DB.prepare(comparisonSQL+` SELECT 0 AS section,'' AS sort_id,0 AS sort_position,0 AS sort_other,0 AS sort_media,
  (SELECT json_object('groupRevision',(SELECT revision FROM x_group_control WHERE id=1),'all',COUNT(*),'pending',COALESCE(SUM(review_state='pending'),0),'visible',COALESCE(SUM(review_state='visible'),0),'hidden',COALESCE(SUM(review_state='hidden'),0)) FROM scoped) AS payload
  UNION ALL SELECT 1,author,0,0,0,json_object('author',author) FROM (SELECT DISTINCT author FROM x_review_posts WHERE author IS NOT NULL AND author!='')
  UNION ALL SELECT 2,'',ROW_NUMBER() OVER(ORDER BY priority DESC,published_at DESC,id),0,0,${packedPage}
   FROM (SELECT original.data,p.* FROM page p JOIN posts original ON original.id=p.id)
  UNION ALL SELECT 3,own_id,own_position,other_order,other_position,${packedPair} FROM pairs
  ORDER BY section,sort_id,sort_position,sort_other,sort_media`).bind(...pageArgs).all();
 const meta=JSON.parse(result.results[0].payload),counts={all:meta.all,pending:meta.pending,visible:meta.visible,hidden:meta.hidden},byPost=new Map();
 const authors=[],pageRows=[];
 for(const record of result.results){if(record.section===1)authors.push(JSON.parse(record.payload).author);else if(record.section===2)pageRows.push(JSON.parse(record.payload));}
 for(const record of result.results){
  if(record.section!==3)continue;const row=JSON.parse(record.payload);
  const pair={postId:row.post_id,url:row.url,image:row.image,ownImage:row.own_image,exact:!!row.exact,
   ...(row.author_present?{author:row.author}:{}),...(row.published_present?{publishedAt:row.published_at}:{}),visible:!!row.visible,decision:row.decision,revision:row.revision};
  if(!byPost.has(row.own_id))byPost.set(row.own_id,[]);byPost.get(row.own_id).push(pair);
 }
 const response={groupRevision:meta.groupRevision,authors:authors.sort(),counts,total:counts[status],items:pageRows.map(row=>{
  const post=JSON.parse(row.data);return {...post,decision:row.decision,revision:row.revision,availability:row.availability,visible:!!row.visible,checkedAt:row.checked_at,missingCount:row.missing_count??0,reviewState:row.review_state,comparisons:byPost.get(post.id)??[]};
 })};
 if(onMeasurement)onMeasurement({meta:result.meta,resultBytes:new TextEncoder().encode(JSON.stringify(response)).byteLength});
 return response;
}
