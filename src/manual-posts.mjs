import {manualUrl,fetchManualX,manualInstagram,providerJson} from './manual-provider.mjs';
const active=['pending','starting','waiting'];
const opaque=value=>typeof value==='string'&&/^[A-Za-z0-9]{3,64}$/.test(value);
export async function existingPost(DB,p){
 return DB.prepare("SELECT id FROM posts WHERE id=? OR json_extract(data,'$.canonicalUrl')=? UNION ALL SELECT 'ig:'||code FROM instagram_review WHERE code=? LIMIT 1").bind(p.id.replace('manual:',''),p.canonicalUrl,p.platform==='instagram'?p.platformPostId:'').first();
}
export async function registerManual(env,body){
 const {DB}=env;let p;try{if(typeof body.url!=='string'||body.url.length>2048||body.retry!==undefined&&typeof body.retry!=='boolean')throw Error();p=manualUrl(body.url.trim());}catch{return {status:400,error:'invalid_url'};}
 if(await existingPost(DB,p))return {status:200,saved:false,existing:true};
 const date=new Date().toISOString(),data={...p,manual:true,publishedAt:date,dateEstimated:true,caption:'',contentKind:'other',observedViaSource:'manual',media:[{kind:'link',previewUrl:null}]};
 const results=await DB.batch([
  DB.prepare('INSERT OR IGNORE INTO manual_posts(id,canonical_url,data,created_at) VALUES(?,?,?,?)').bind(p.id,p.canonicalUrl,JSON.stringify(data),date),
  DB.prepare('INSERT OR IGNORE INTO manual_media_jobs(post_id) VALUES(?)').bind(p.id)
 ]);
 if(body.retry)await DB.prepare("UPDATE manual_media_jobs SET state=CASE WHEN state='failed' AND run_id IS NOT NULL AND error!='run_failed' THEN 'waiting' ELSE 'pending' END,run_id=CASE WHEN state='failed' AND error!='run_failed' THEN run_id ELSE NULL END,error=NULL,next_due_at=0,updated_at=unixepoch() WHERE post_id=? AND state IN ('ready','no_media','failed') AND lease_until<=unixepoch() AND updated_at<=unixepoch()-30").bind(p.id).run();
 const job=await DB.prepare('SELECT state,error FROM manual_media_jobs WHERE post_id=?').bind(p.id).first();
 return {status:active.includes(job.state)&&env.MANUAL_MEDIA_ENABLED==='true'?202:results[0].meta.changes?201:200,id:p.id,saved:results[0].meta.changes===1,existing:results[0].meta.changes===0,state:job.state,error:job.error,enabled:env.MANUAL_MEDIA_ENABLED==='true'};
}
export async function listManual(env,params){
 const offset=Number(params.get('offset')??0);if(!Number.isSafeInteger(offset)||offset<0||offset>100000)return {status:400,error:'invalid_input'};
 const {results}=await env.DB.prepare('SELECT m.id,m.canonical_url,m.data,j.state,j.error,j.updated_at FROM manual_posts m JOIN manual_media_jobs j ON j.post_id=m.id ORDER BY m.created_at DESC,m.id DESC LIMIT 6 OFFSET ?').bind(offset).all();
 return {status:200,enabled:env.MANUAL_MEDIA_ENABLED==='true',posts:results.slice(0,5).map(r=>({id:r.id,url:r.canonical_url,platform:JSON.parse(r.data).platform,state:r.state,error:r.error,updatedAt:r.updated_at,retryAfter:Math.max(0,30-(Math.floor(Date.now()/1000)-r.updated_at))})),nextOffset:results.length>5?offset+5:null};
}
// One durable job step. Requests give new registrations an immediate start; Cron recovers interrupted work.
export async function processManual(env,{fetcher=fetch,id=null}={}){
 if(env.MANUAL_MEDIA_ENABLED!=='true')return {status:'disabled'};
 const {DB}=env,token=crypto.randomUUID();
 const job=await DB.prepare("UPDATE manual_media_jobs SET lease_token=?,lease_until=unixepoch()+60 WHERE post_id=(SELECT post_id FROM manual_media_jobs WHERE state IN ('pending','starting','waiting') AND next_due_at<=unixepoch() AND lease_until<=unixepoch() AND (? IS NULL OR post_id=?) ORDER BY next_due_at,post_id LIMIT 1) RETURNING *").bind(token,id,id).first();
 if(!job)return {status:'idle'};
 const finish=async(state,error=null,runId=job.run_id,delay=0)=>DB.prepare('UPDATE manual_media_jobs SET state=?,error=?,run_id=?,next_due_at=unixepoch()+?,lease_token=NULL,lease_until=0,updated_at=unixepoch() WHERE post_id=? AND lease_token=?').bind(state,error,runId,delay,job.post_id,token).run();
 let post,row;
 try{
  row=await DB.prepare('SELECT data FROM manual_posts WHERE id=?').bind(job.post_id).first();
  post={...JSON.parse(row.data),...manualUrl(JSON.parse(row.data).canonicalUrl)};
  if(await existingPost(DB,post)){await finish('existing');return {status:'existing'};}
  let enriched;
  if(post.platform==='x')enriched=await fetchManualX(post,fetcher);
  else {
   if(!env.APIFY_TOKEN)throw Error('not_configured');
   if(job.state==='starting'&&!job.run_id)throw Error('start_uncertain');
   if(!job.run_id){
    const claim=await DB.prepare("UPDATE manual_media_jobs SET state='starting',started_at=unixepoch() WHERE post_id=? AND lease_token=? AND lease_until>unixepoch() AND state='pending'").bind(job.post_id,token).run();
    if(claim.meta.changes!==1)return {status:'stale'};
    // Do not replay an ambiguous paid start after a network failure or lost lease.
    let run;try{run=(await providerJson('https://api.apify.com/v2/acts/apify~instagram-scraper/runs?waitForFinish=0&timeout=120&maxTotalChargeUsd=0.05',{fetcher,token:env.APIFY_TOKEN,body:{directUrls:[post.canonicalUrl],resultsType:post.canonicalUrl.includes('/reel/')?'reels':'posts',resultsLimit:1}})).data;}catch(error){throw Error(['provider_network','invalid_response','response_too_large'].includes(error.message)?'start_uncertain':error.message);}
    if(!opaque(run?.id))throw Error('start_uncertain');
    await finish('waiting',null,run.id,10);return {status:'waiting'};
   }
   if(!opaque(job.run_id))throw Error('invalid_response');
   const run=(await providerJson(`https://api.apify.com/v2/actor-runs/${job.run_id}`,{fetcher,token:env.APIFY_TOKEN})).data;
   if(run?.id!==job.run_id)throw Error('invalid_response');
   if(['READY','RUNNING','TIMING-OUT','ABORTING'].includes(run.status)){if(job.started_at&&Date.now()/1000-job.started_at>900)throw Error('run_timeout');await finish('waiting',null,job.run_id,10);return {status:'waiting'};}
   if(run.status!=='SUCCEEDED')throw Error('run_failed');
   if(!opaque(run.defaultDatasetId))throw Error('invalid_response');
   const rows=await providerJson(`https://api.apify.com/v2/datasets/${run.defaultDatasetId}/items?format=json&limit=2&clean=false&fields=shortCode,type,isVideo,productType,caption,ownerUsername,timestamp,displayUrl,thumbnailUrl,images,childPosts,mediaCount`,{fetcher,token:env.APIFY_TOKEN});
   enriched=manualInstagram(post,rows);
  }
  const state=enriched.media.some(m=>m.previewUrl)?'ready':'no_media';
  const guard=crypto.randomUUID();
  await DB.batch([
   DB.prepare('INSERT INTO commit_guard(token,ok) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM manual_media_jobs WHERE post_id=? AND lease_token=? AND lease_until>unixepoch()) AND (SELECT data FROM manual_posts WHERE id=?)=? THEN 1 ELSE 0 END').bind(guard,job.post_id,token,job.post_id,row.data),
   DB.prepare('UPDATE manual_posts SET data=?,canonical_url=? WHERE id=?').bind(JSON.stringify(enriched),enriched.canonicalUrl,job.post_id),
   DB.prepare('UPDATE manual_media_jobs SET state=?,error=NULL,lease_token=NULL,lease_until=0,updated_at=unixepoch() WHERE post_id=? AND lease_token=?').bind(state,job.post_id,token),
   DB.prepare('DELETE FROM commit_guard WHERE token=?').bind(guard)
  ]);
  return {status:state};
 }catch(error){
  if(/CHECK constraint failed/i.test(String(error)))return {status:'stale'};
  const code=['provider_network','provider_failure','provider_access','not_found','unavailable','rate_limited','invalid_response','response_too_large','not_configured','start_uncertain','run_timeout','run_failed'].includes(error.message)?error.message:'save_failed';
  await finish('failed',code);return {status:'failed',error:code};
 }
}
