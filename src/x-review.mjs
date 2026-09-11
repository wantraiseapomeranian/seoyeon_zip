import {reviewFilters} from './review-filters.mjs';
const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
export async function handleXReview(request,env){
 const url=new URL(request.url),DB=env.DB;
 if(request.method==='GET'){
  const status=url.searchParams.get('status')??'pending';if(!['pending','visible','hidden','all'].includes(status))return reply({error:'invalid_query'},400);
  const offset=Number(url.searchParams.get('offset')??0);if(!Number.isSafeInteger(offset)||offset<0||offset>100000)return reply({error:'invalid_query'},400);
  let filters;try{filters=reviewFilters(url.searchParams);}catch{return reply({error:'invalid_query'},400);}
  const {results}=await DB.prepare("SELECT p.id,p.data,q.decision,q.revision,q.availability,q.checked_at,q.missing_count,EXISTS(SELECT 1 FROM x_feed_posts f WHERE f.id=p.id) AS visible FROM posts p LEFT JOIN x_quality q ON q.post_id=p.id ORDER BY (COALESCE(q.availability,'')='missing' OR COALESCE(q.decision,'auto')='hidden' OR json_extract(p.data,'$.moderationReason') IS NOT NULL) DESC,json_extract(p.data,'$.publishedAt') DESC,p.id").all();
  const group=await DB.prepare('SELECT revision FROM x_group_control WHERE id=1').first();
  const photos=await DB.prepare("SELECT p.id,json_extract(p.data,'$.canonicalUrl') AS url,json_extract(m.value,'$.previewUrl') AS image,COALESCE(f.confirmed_hash,f.hash) AS hash,f.near_url FROM posts p,json_each(p.data,'$.media') m JOIN x_fingerprints f ON f.url=json_extract(m.value,'$.previewUrl') WHERE f.hash IS NOT NULL").all();
  const rejected=await DB.prepare('SELECT left_url,right_url FROM x_photo_differences').all();
  const pairKey=(a,b)=>JSON.stringify([a,b].sort());
  const excluded=new Set(rejected.results.map(r=>pairKey(r.left_url,r.right_url)));
  const metadata=new Map(results.map(r=>{const p=JSON.parse(r.data);return[r.id,{author:p.authorHandle,publishedAt:p.publishedAt,visible:!!r.visible,decision:r.decision??'auto',revision:r.revision??0}];}));
  const comparisons=new Map();
  for(const a of photos.results){for(const b of photos.results){if(b.id===a.id||(a.hash!==b.hash&&excluded.has(pairKey(a.image,b.image)))||!((a.hash&&a.hash===b.hash)||a.near_url===b.image||b.near_url===a.image))continue;const list=comparisons.get(a.id)??[];list.push({postId:b.id,url:b.url,image:b.image,ownImage:a.image,exact:a.hash===b.hash,...metadata.get(b.id)});comparisons.set(a.id,list);}}
  const items=results.map(r=>({...JSON.parse(r.data),decision:r.decision??'auto',revision:r.revision??0,availability:r.availability??'unknown',visible:!!r.visible,checkedAt:r.checked_at,missingCount:r.missing_count??0,comparisons:comparisons.get(r.id)??[]}));
  const scoped=items.filter(filters.matches),counts={pending:0,visible:0,hidden:0,all:scoped.length};
  for(const p of scoped){p.reviewState=p.decision==='auto'&&(p.moderationReason||p.availability==='missing'||p.comparisons.some(c=>!c.exact))?'pending':p.visible?'visible':'hidden';counts[p.reviewState]++;}
  const filtered=status==='all'?scoped:scoped.filter(p=>p.reviewState===status);
  return reply({groupRevision:group.revision,authors:[...new Set(items.map(p=>p.authorHandle).filter(Boolean))].sort(),counts,total:filtered.length,items:filtered.slice(offset,offset+25)});
 }
 if(request.method!=='POST')return reply({error:'method_not_allowed'},405);
 if(request.headers.get('origin')!==url.origin||request.headers.get('x-review-action')!=='review')return reply({error:'invalid_origin'},403);
 if(!request.headers.get('content-type')?.startsWith('application/json'))return reply({error:'invalid_input'},400);
 const reader=request.body?.getReader();if(!reader)return reply({error:'invalid_input'},400);
 let text='',size=0;const decoder=new TextDecoder();while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2048){await reader.cancel();return reply({error:'invalid_input'},400);}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();
 let value;try{value=JSON.parse(text);}catch{return reply({error:'invalid_input'},400);}
 if(['merge','unmerge','different'].includes(value?.action)){
  if(!Number.isSafeInteger(value.groupRevision)||value.groupRevision<0)return reply({error:'invalid_input'},400);
  let change;
  if(value.action==='merge'||value.action==='different'){
   if(typeof value.left!=='string'||typeof value.right!=='string'||value.left===value.right)return reply({error:'invalid_input'},400);
   const found=await DB.prepare('SELECT COUNT(*) AS n FROM x_fingerprints WHERE url IN (?,?) AND hash IS NOT NULL').bind(value.left,value.right).first();
   if(found.n!==2)return reply({error:'invalid_input'},400);
   if(value.action==='different'){const [left,right]=[value.left,value.right].sort();change=DB.prepare('INSERT OR IGNORE INTO x_photo_differences(left_url,right_url) VALUES(?,?)').bind(left,right);}else change=DB.prepare('UPDATE x_fingerprints SET confirmed_hash=? WHERE COALESCE(confirmed_hash,hash) IN (SELECT COALESCE(confirmed_hash,hash) FROM x_fingerprints WHERE url IN (?,?))').bind('review:'+crypto.randomUUID(),value.left,value.right);
  }else{
   if(typeof value.image!=='string')return reply({error:'invalid_input'},400);
   change=DB.prepare('UPDATE x_fingerprints SET confirmed_hash=NULL WHERE url=?').bind(value.image);
  }
  const token=crypto.randomUUID();
  try{await DB.batch([
   DB.prepare('INSERT INTO commit_guard(token,ok) SELECT ?,CASE WHEN revision=? THEN 1 ELSE 0 END FROM x_group_control WHERE id=1').bind(token,value.groupRevision),
   change,DB.prepare('UPDATE x_group_control SET revision=revision+1 WHERE id=1'),DB.prepare('DELETE FROM commit_guard WHERE token=?').bind(token)
  ]);}catch(e){if(/CHECK constraint failed/i.test(String(e)))return reply({error:'review_conflict'},409);throw e;}
  return reply({saved:true});
 }
 if(!value||!/^x:\d{1,30}$/.test(value.id)||!['auto','visible','hidden'].includes(value.decision)||!Number.isSafeInteger(value.revision)||value.revision<0)return reply({error:'invalid_input'},400);
 if(!await DB.prepare('SELECT id FROM posts WHERE id=?').bind(value.id).first())return reply({error:'not_found'},404);
 await DB.prepare('INSERT OR IGNORE INTO x_quality(post_id) VALUES(?)').bind(value.id).run();
 const r=await DB.prepare('UPDATE x_quality SET decision=?,revision=revision+1 WHERE post_id=? AND revision=?').bind(value.decision,value.id,value.revision).run();
 return r.meta.changes===1?reply({saved:true}):reply({error:'review_conflict'},409);
}
