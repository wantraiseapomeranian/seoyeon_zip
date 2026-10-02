import {providerJson} from './manual-provider.mjs';
import {normalize} from './instagram-import.mjs';
const batchSize=18,successDelay=3*86400;
const opaque=value=>typeof value==='string'&&/^[A-Za-z0-9]{3,64}$/.test(value);
const fields='shortCode,type,isVideo,productType,ownerUsername,displayUrl,thumbnailUrl,images,childPosts,mediaCount,error,inputUrl,url';
const visible="r.status='kept' AND EXISTS(SELECT 1 FROM managed_feed_posts p,json_each(p.data,'$.media') m WHERE p.id='ig:'||r.code AND json_extract(m.value,'$.kind')='image')";
const fail=code=>{throw Error(code);};
const backoff=failures=>Math.min(86400,3600*2**Math.min(failures,5));
function identity(value){
 const u=new URL(value),filename=u.pathname.split('/').at(-1);
 // Only Instagram's long numeric asset names can identify a file across CDN path changes.
 return /^\d+_\d+_\d+_[a-z]\.(jpg|jpeg|png|webp)$/i.test(filename)?filename:u.pathname;
}
function rendition(value){
 const u=new URL(value);
 const query=[...u.searchParams].filter(([key])=>!/^_nc_/.test(key)&&!['oh','oe','ccb','edm','ig_cache_key'].includes(key)).sort(([a,av],[b,bv])=>a.localeCompare(b)||av.localeCompare(bv));
 return JSON.stringify([u.pathname,query]);
}
function renew(old,fresh){
 const images=old.images??(old.image?[old.image]:[]),incoming=fresh.media;
 const oldKeys=images.map(identity),newKeys=incoming.map(m=>identity(m.previewUrl));
 if(new Set(oldKeys).size!==oldKeys.length||new Set(newKeys).size!==newKeys.length)fail('ambiguous_asset');
 const mapping=new Map(),aliases=new Map(),clearAliases=[];let missing=false;
 for(let position=0;position<images.length;position++){
  const previous=images[position];if(old.media?.[position]?.kind!=='image')continue;
  const item=incoming.find(m=>identity(m.previewUrl)===oldKeys[position]);
  if(!item||item.kind==='video'){missing=true;continue;}
  if(rendition(previous)!==rendition(item.previewUrl)){aliases.set(previous,item.previewUrl);continue;}
  clearAliases.push(previous);
  if(previous!==item.previewUrl)mapping.set(previous,item.previewUrl);
 }
 const data={...old};
 if(mapping.size){
  if(Array.isArray(old.images))data.images=old.images.map(u=>mapping.get(u)??u);
  if(old.image)data.image=mapping.get(old.image)??old.image;
  if(Array.isArray(old.media))data.media=old.media.map(m=>({...m,previewUrl:mapping.get(m.previewUrl)??m.previewUrl}));
 }
 return {data,mapping,aliases,clearAliases,error:missing?'incomplete_media':null};
}
export async function instagramMediaRefreshStatus(env){
 if(env.INSTAGRAM_MEDIA_REFRESH_ENABLED!=='true'||env.APIFY_SYNC_ENABLED!=='true')return {status:'disabled'};
 if(!env.APIFY_TOKEN)return {status:'unconfigured'};
 const row=await env.DB.prepare('SELECT state,run_id,last_error,last_success_at,next_due_at,starts_today,budget_day FROM instagram_media_refresh WHERE id=1').first();
 return {status:row.state==='error'||row.state==='starting'?'blocked':row.state,error:row.last_error,runId:row.run_id,refreshedAt:row.last_success_at,nextDueAt:row.next_due_at,startsToday:row.starts_today,budgetDay:row.budget_day};
}
// Cron advances one durable step. Public reads never start a paid run.
export async function refreshInstagramMedia(env,{fetcher=fetch}={}){
 if(env.INSTAGRAM_MEDIA_REFRESH_ENABLED!=='true'||env.APIFY_SYNC_ENABLED!=='true')return {status:'disabled'};
 if(!env.APIFY_TOKEN)return {status:'unconfigured'};
 const {DB}=env,token=crypto.randomUUID();
 const state=await DB.prepare('SELECT state,last_error FROM instagram_media_refresh WHERE id=1').first();
 if(state.state==='error')return {status:'blocked',error:state.last_error};
 const job=await DB.prepare("UPDATE instagram_media_refresh SET lease_token=?,lease_until=unixepoch()+120 WHERE id=1 AND state!='error' AND next_due_at<=unixepoch() AND lease_until<=unixepoch() RETURNING *,unixepoch() AS now").bind(token).first();
 if(!job)return {status:'idle'};
 const guard=()=>DB.prepare('INSERT INTO commit_guard(token,ok) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM instagram_media_refresh WHERE id=1 AND lease_token=? AND lease_until>unixepoch()) THEN 1 ELSE 0 END').bind(token,token);
 const clear=()=>DB.prepare('DELETE FROM commit_guard WHERE token=?').bind(token);
 const release=async(delay,error=null)=>DB.prepare('UPDATE instagram_media_refresh SET next_due_at=unixepoch()+?,last_error=?,lease_token=NULL,lease_until=0 WHERE id=1 AND lease_token=? AND lease_until>unixepoch()').bind(delay,error,token).run();
 let codes=JSON.parse(job.codes_json),snapshots=[];
 const finishError=async(error)=>{
  await DB.batch([guard(),...codes.map(code=>DB.prepare('INSERT INTO instagram_media_refresh_posts(code,next_due_at,failures,last_error) VALUES(?,unixepoch()+3600,1,?) ON CONFLICT(code) DO UPDATE SET next_due_at=unixepoch()+MIN(86400,3600*(1<<MIN(failures,5))),failures=failures+1,last_error=excluded.last_error').bind(code,error)),DB.prepare("UPDATE instagram_media_refresh SET state='idle',last_error=?,codes_json='[]',failures=0,next_due_at=unixepoch()+300,lease_token=NULL,lease_until=0 WHERE id=1").bind(error),clear()]);
  return {status:'retry',error,updated:0};
 };
 try{
  if(job.state==='starting'){
   await DB.prepare("UPDATE instagram_media_refresh SET state='error',last_error='start_uncertain',lease_token=NULL,lease_until=0 WHERE id=1 AND lease_token=? AND lease_until>unixepoch()").bind(token).run();return {status:'blocked',error:'start_uncertain'};
  }
  if(job.state==='idle'){
   const {results}=await DB.prepare(`SELECT r.code,r.data FROM instagram_review r LEFT JOIN instagram_media_refresh_posts f ON f.code=r.code WHERE ${visible} AND COALESCE(f.next_due_at,0)<=unixepoch() ORDER BY COALESCE(f.next_due_at,0),r.code LIMIT ${batchSize}`).all();
   if(!results.length){await release(3600);return {status:'idle'};}
   const day=Math.floor(job.now/86400);
   if(job.budget_day===day&&job.starts_today>=2){await release((day+1)*86400-job.now,'daily_budget');return {status:'budget_wait'};}
   codes=results.map(r=>r.code);
   await DB.batch([guard(),DB.prepare("UPDATE instagram_media_refresh SET state='starting',run_id=NULL,codes_json=?,started_at=unixepoch(),last_error=NULL,failures=0,budget_day=?,starts_today=CASE WHEN budget_day=? THEN starts_today+1 ELSE 1 END WHERE id=1").bind(JSON.stringify(codes),day,day),clear()]);
   // Any uncertain POST response stays blocked, including a lost save after the paid start.
   let run;
   try{run=(await providerJson('https://api.apify.com/v2/acts/apify~instagram-scraper/runs?waitForFinish=0&timeout=120&maxTotalChargeUsd=0.05',{fetcher,token:env.APIFY_TOKEN,body:{directUrls:codes.map(code=>`https://www.instagram.com/p/${code}/`),resultsType:'posts',resultsLimit:1}})).data;if(!opaque(run?.id))fail('start_uncertain');}
   catch{await DB.prepare("UPDATE instagram_media_refresh SET state='error',last_error='start_uncertain',lease_token=NULL,lease_until=0 WHERE id=1 AND lease_token=? AND lease_until>unixepoch()").bind(token).run();return {status:'blocked',error:'start_uncertain'};}
   const saved=await DB.prepare("UPDATE instagram_media_refresh SET state='waiting',run_id=?,next_due_at=unixepoch()+10,lease_token=NULL,lease_until=0 WHERE id=1 AND lease_token=? AND lease_until>unixepoch() AND state='starting'").bind(run.id,token).run();
   return saved.meta.changes?{status:'waiting',runId:run.id}:{status:'stale'};
  }
  if(job.now-job.started_at>1800)return await finishError('run_timeout');
  if(!opaque(job.run_id))return await finishError('invalid_response');
  const run=(await providerJson(`https://api.apify.com/v2/actor-runs/${job.run_id}`,{fetcher,token:env.APIFY_TOKEN})).data;
  if(run?.id!==job.run_id)fail('invalid_response');
  if(['READY','RUNNING','TIMING-OUT','ABORTING'].includes(run.status)){await release(60);return {status:'waiting',runId:job.run_id};}
  if(run.status!=='SUCCEEDED')return await finishError('run_failed');
  if(!opaque(run.defaultDatasetId))fail('invalid_response');
  // Read latest metadata before the remote page; the transaction checks it again after download.
  snapshots=(await DB.prepare(`SELECT r.code,r.data,r.revision,f.failures FROM instagram_review r LEFT JOIN instagram_media_refresh_posts f ON f.code=r.code WHERE r.code IN (SELECT value FROM json_each(?)) AND ${visible}`).bind(JSON.stringify(codes)).all()).results;
  const rows=await providerJson(`https://api.apify.com/v2/datasets/${run.defaultDatasetId}/items?format=json&limit=${batchSize+1}&clean=false&skipEmpty=false&skipHidden=false&fields=${fields}`,{fetcher,token:env.APIFY_TOKEN});
  // Diagnostics contain only fixed labels, bounded counts and already requested public shortcodes.
  if(!Array.isArray(rows))return await finishError('dataset_shape');
  if(rows.length>codes.length)return await finishError(`dataset_count:${codes.length}:${Math.min(rows.length,1000)}`);
  const inputCategory=value=>{
   if(codes.some(code=>value===`https://www.instagram.com/p/${code}/`))return 'requested_canonical';
   try{const u=new URL(value),match=u.pathname.match(/^\/(?:p|reel)\/([A-Za-z0-9_-]{5,64})\/?$/);if(u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&['instagram.com','www.instagram.com'].includes(u.hostname)&&match&&codes.includes(match[1]))return 'requested_post_variant';}catch{}
   return 'other';
  };
  const normalized=new Map(),failedCodes=new Set(),seenCodes=new Set();
  for(const [index,row] of rows.entries()){
   let code=row?.shortCode;
   const explicitError=typeof row?.error==='string'&&row.error.length>0&&row.error.length<=2000;
   if(explicitError){
    const input=row.inputUrl??row.url;
    code=codes.find(c=>input===`https://www.instagram.com/p/${c}/`);
    if(!code)return await finishError(`dataset_error_identity:${index}:unmatched:${inputCategory(input)}`);
    if(row.shortCode!==undefined&&row.shortCode!==code)return await finishError(`dataset_error_identity:${index}:shortcode_mismatch`);
    if(row.inputUrl!==undefined&&row.url!==undefined&&row.inputUrl!==row.url)return await finishError(`dataset_error_identity:${index}:url_disagreement:${inputCategory(row.inputUrl)}:${inputCategory(row.url)}`);
   }
   if(!codes.includes(code))return await finishError(`dataset_identity:${index}:${typeof code==='string'&&/^[A-Za-z0-9_-]{5,64}$/.test(code)?'unrequested':'invalid'}`);
   if(seenCodes.has(code))return await finishError('dataset_duplicate:'+code);
   if(row?.error!=null&&!explicitError)return await finishError('dataset_error_shape:'+code);
   seenCodes.add(code);
   if(explicitError){failedCodes.add(code);continue;}
   if(!/^[A-Za-z0-9_.]{1,30}$/.test(row.ownerUsername??''))fail('invalid_author');
   let fresh;try{fresh=normalize(row);}catch{return await finishError('dataset_normalize:'+code);}
   if(Array.isArray(row.childPosts)&&row.childPosts.length&&fresh.media.length!==row.childPosts.length)return await finishError(`dataset_child_media:${code}:${Math.min(row.childPosts.length,101)}:${fresh.media.length}`);
   normalized.set(row.shortCode,fresh);
  }
  const statements=[guard()],transfers=new Map(),patches=[],outcomes=[],aliases=[],clearAliases=[];let updated=0,failed=0;
  statements.push(DB.prepare(`INSERT INTO commit_guard(token,ok) SELECT ?,CASE WHEN NOT EXISTS(SELECT 1 FROM json_each(?) s WHERE NOT EXISTS(SELECT 1 FROM instagram_review r WHERE r.code=json_extract(s.value,'$.code') AND r.data=json_extract(s.value,'$.data') AND r.revision=json_extract(s.value,'$.revision') AND ${visible})) THEN 1 ELSE 0 END`).bind(token+':posts',JSON.stringify(snapshots)));
  for(const snapshot of snapshots){
   const old=JSON.parse(snapshot.data),fresh=normalized.get(snapshot.code);let result;
   if(fresh){
    if(fresh.author.toLowerCase()!==(old.author??'').toLowerCase())fail('author_mismatch');
    result=renew(old,fresh);
   }else result={data:old,mapping:new Map(),aliases:new Map(),clearAliases:[],error:failedCodes.has(snapshot.code)?'provider_post_error':'missing_post'};
   for(const [from,to] of result.mapping){if(transfers.has(from)&&transfers.get(from)!==to)fail('ambiguous_asset');transfers.set(from,to);}
   if(result.mapping.size||result.aliases.size)updated++;
   if(result.mapping.size)patches.push({code:snapshot.code,data:JSON.stringify(result.data)});
   for(const [source,preview] of result.aliases)aliases.push({code:snapshot.code,source,preview});
   for(const source of result.clearAliases)clearAliases.push({code:snapshot.code,source});
   if(result.error)failed++;
   outcomes.push({code:snapshot.code,delay:result.error?backoff(snapshot.failures??0):successDelay,success:result.error?0:1,failures:result.error?(snapshot.failures??0)+1:0,error:result.error});
  }
  statements.push(DB.prepare("UPDATE instagram_review SET data=(SELECT json_extract(p.value,'$.data') FROM json_each(?) p WHERE json_extract(p.value,'$.code')=instagram_review.code) WHERE code IN (SELECT json_extract(value,'$.code') FROM json_each(?))").bind(JSON.stringify(patches),JSON.stringify(patches)));
  statements.push(DB.prepare("INSERT INTO instagram_preview_urls(code,source_url,preview_url,updated_at) SELECT json_extract(value,'$.code'),json_extract(value,'$.source'),json_extract(value,'$.preview'),unixepoch() FROM json_each(?) WHERE true ON CONFLICT(code,source_url) DO UPDATE SET preview_url=excluded.preview_url,updated_at=excluded.updated_at").bind(JSON.stringify(aliases)));
  // A same-rendition/current-source response supersedes an older display alias for that exact source key.
  statements.push(DB.prepare("DELETE FROM instagram_preview_urls WHERE (code,source_url) IN (SELECT json_extract(value,'$.code'),json_extract(value,'$.source') FROM json_each(?))").bind(JSON.stringify(clearAliases)));
  statements.push(DB.prepare("INSERT INTO instagram_media_refresh_posts(code,next_due_at,last_success_at,failures,last_error) SELECT json_extract(value,'$.code'),unixepoch()+json_extract(value,'$.delay'),CASE WHEN json_extract(value,'$.success')=1 THEN unixepoch() ELSE NULL END,json_extract(value,'$.failures'),json_extract(value,'$.error') FROM json_each(?) WHERE true ON CONFLICT(code) DO UPDATE SET next_due_at=excluded.next_due_at,last_success_at=COALESCE(excluded.last_success_at,last_success_at),failures=excluded.failures,last_error=excluded.last_error").bind(JSON.stringify(outcomes)));
  const mapping=JSON.stringify([...transfers].map(([from,to])=>({from,to})));
  if(transfers.size){
   // Existing byte/dedup hashes must agree before merging URL keys. Read current evidence in the transaction.
   statements.push(DB.prepare("INSERT INTO commit_guard(token,ok) SELECT ?,CASE WHEN NOT EXISTS(SELECT 1 FROM json_each(?) m JOIN x_fingerprints old ON old.url=json_extract(m.value,'$.from') JOIN x_fingerprints fresh ON fresh.url=json_extract(m.value,'$.to') WHERE (old.hash IS NOT NULL AND fresh.hash IS NOT NULL AND old.hash!=fresh.hash) OR (old.confirmed_hash IS NOT NULL AND fresh.confirmed_hash IS NOT NULL AND old.confirmed_hash!=fresh.confirmed_hash)) THEN 1 ELSE 0 END").bind(token+':hashes',mapping));
   statements.push(DB.prepare("INSERT INTO x_fingerprints(url,hash,confirmed_hash,dhash,width,height,near_url,error,next_check,candidate_metadata_json) SELECT json_extract(m.value,'$.to'),f.hash,f.confirmed_hash,f.dhash,f.width,f.height,COALESCE((SELECT json_extract(n.value,'$.to') FROM json_each(?) n WHERE json_extract(n.value,'$.from')=f.near_url),f.near_url),NULL,0,f.candidate_metadata_json FROM json_each(?) m JOIN x_fingerprints f ON f.url=json_extract(m.value,'$.from') WHERE true ON CONFLICT(url) DO UPDATE SET hash=COALESCE(x_fingerprints.hash,excluded.hash),confirmed_hash=COALESCE(x_fingerprints.confirmed_hash,excluded.confirmed_hash),dhash=COALESCE(x_fingerprints.dhash,excluded.dhash),width=COALESCE(x_fingerprints.width,excluded.width),height=COALESCE(x_fingerprints.height,excluded.height),near_url=COALESCE(x_fingerprints.near_url,excluded.near_url),candidate_metadata_json=COALESCE(x_fingerprints.candidate_metadata_json,excluded.candidate_metadata_json),error=NULL,next_check=0").bind(mapping,mapping));
   statements.push(DB.prepare("INSERT OR IGNORE INTO x_photo_differences(left_url,right_url) SELECT MIN(l,r),MAX(l,r) FROM (SELECT COALESCE((SELECT json_extract(m.value,'$.to') FROM json_each(?) m WHERE json_extract(m.value,'$.from')=d.left_url),d.left_url) l,COALESCE((SELECT json_extract(m.value,'$.to') FROM json_each(?) m WHERE json_extract(m.value,'$.from')=d.right_url),d.right_url) r FROM x_photo_differences d) WHERE l!=r").bind(mapping,mapping));
   statements.push(DB.prepare("UPDATE x_fingerprints SET near_url=(SELECT json_extract(m.value,'$.to') FROM json_each(?) m WHERE json_extract(m.value,'$.from')=x_fingerprints.near_url) WHERE near_url IN (SELECT json_extract(value,'$.from') FROM json_each(?))").bind(mapping,mapping));
  }
  statements.push(DB.prepare("UPDATE instagram_media_refresh SET state='idle',codes_json='[]',last_success_at=unixepoch(),last_error=?,failures=0,next_due_at=unixepoch()+300,lease_token=NULL,lease_until=0 WHERE id=1").bind(failed?'partial_refresh':null));
  statements.push(DB.prepare('DELETE FROM commit_guard WHERE token=? OR token LIKE ?').bind(token,token+':%'));
  await DB.batch(statements);
  return {status:'complete',runId:job.run_id,updated,failed,aliased:aliases.length};
 }catch(error){
  if(/CHECK constraint failed/i.test(String(error))){await release(60,'refresh_conflict');return {status:'retry',error:'refresh_conflict',updated:0};}
  const code=['provider_network','provider_failure','provider_access','not_found','rate_limited','invalid_response','response_too_large','invalid_author','author_mismatch','ambiguous_asset'].includes(error.message)?error.message:'save_failed';
  if(['invalid_author','author_mismatch','ambiguous_asset'].includes(code))return await finishError(code);
  // Retry GETs against the durable run id; never submit another POST for a polling/save failure.
  await DB.prepare('UPDATE instagram_media_refresh SET failures=failures+1,last_error=?,next_due_at=unixepoch()+?,lease_token=NULL,lease_until=0 WHERE id=1 AND lease_token=? AND lease_until>unixepoch()').bind(code,Math.min(900,60*2**Math.min(job.failures,4)),token).run();
  return {status:'retry',error:code,updated:0};
 }
}
