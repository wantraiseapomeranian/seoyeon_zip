import {importInstagram} from './instagram-import.mjs';
const id=value=>typeof value==='string'&&/^[A-Za-z0-9]{3,64}$/.test(value);
const fail=code=>{throw new Error(code);};
// Normal polls align to the next 2-59/5 cron boundary; errors retain elapsed-time backoff.
const fields='shortCode,type,isVideo,productType,caption,ownerUsername,timestamp,displayUrl,thumbnailUrl,images,childPosts,mediaCount';
async function apify(env,path,fetcher){
 let response;try{response=await fetcher('https://api.apify.com/v2/'+path,{method:'GET',headers:{Authorization:'Bearer '+env.APIFY_TOKEN},redirect:'manual',signal:AbortSignal.timeout(15000)});}catch{fail('apify_network');}
 if(!response.ok){await response.body?.cancel();fail('apify_http_'+response.status);}
 const reader=response.body?.getReader();if(!reader)fail('apify_empty_response');
 let size=0;const chunks=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2_000_000){await reader.cancel();fail('apify_response_too_large');}chunks.push(value);}}catch(error){if(error.message==='apify_response_too_large')throw error;fail('apify_network');}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 try{return JSON.parse(new TextDecoder().decode(bytes));}catch{fail('apify_invalid_json');}
}
export async function instagramSyncStatus(env){
 const configured=!!env.APIFY_TOKEN&&id(env.APIFY_TASK_ID);
 if(!configured||env.APIFY_SYNC_ENABLED!=='true')return {status:configured?'disabled':'unconfigured'};
 const state=await env.DB.prepare('SELECT last_checked_at,last_success_at,last_error,lease_until FROM instagram_sync WHERE id=1').first();
 const failures=await env.DB.prepare("SELECT COUNT(*) AS count FROM instagram_sync_runs WHERE task_id=? AND state='pending' AND last_error IS NOT NULL").bind(env.APIFY_TASK_ID).first();
 return {status:state?.last_error||failures.count?'retry':state?.last_success_at?'connected':'waiting',checkedAt:state?.last_checked_at??null,syncedAt:state?.last_success_at??null,error:state?.last_error??null,pendingErrors:failures.count};
}
export async function syncInstagram(env,{fetcher=fetch}={}){
 if(env.APIFY_SYNC_ENABLED!=='true')return {status:'disabled'};
 if(!env.APIFY_TOKEN||!id(env.APIFY_TASK_ID))return {status:'unconfigured'};
 const DB=env.DB,task=env.APIFY_TASK_ID,token=crypto.randomUUID();
 await DB.prepare('INSERT OR IGNORE INTO instagram_sync(id,task_id) VALUES(1,?)').bind(task).run();
 const acquired=await DB.prepare('UPDATE instagram_sync SET lease_token=?,lease_until=unixepoch()+120 WHERE id=1 AND task_id=? AND lease_until<=unixepoch() AND next_due_at<=unixepoch()').bind(token,task).run();
 if(!acquired.meta.changes)return {status:'idle'};
 const state=await DB.prepare('SELECT discovery_offset,failures FROM instagram_sync WHERE id=1 AND lease_token=?').bind(token).first();
 const guard=()=>DB.prepare('INSERT INTO commit_guard(token,ok) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM instagram_sync WHERE id=1 AND lease_token=? AND lease_until>unixepoch()) THEN 1 ELSE 0 END').bind(token,token);
 const clear=()=>DB.prepare('DELETE FROM commit_guard WHERE token=?').bind(token);
 let run;
 try{
  const listing=await apify(env,`actor-tasks/${task}/runs?desc=false&offset=${state.discovery_offset}&limit=20`,fetcher);
  const runs=listing?.data?.items;if(!Array.isArray(runs)||runs.length>20)fail('apify_invalid_runs');
  for(const run of runs)if(!id(run?.id)||!['READY','RUNNING','SUCCEEDED','FAILED','TIMING-OUT','TIMED-OUT','ABORTING','ABORTED'].includes(run.status))fail('apify_invalid_runs');
  const eligible=runs.filter(r=>r?.status==='SUCCEEDED');
  for(const run of eligible)if(!id(run.id)||!id(run.defaultDatasetId)||!Number.isFinite(Date.parse(run.finishedAt)))fail('apify_invalid_runs');
  await DB.batch([guard(),...eligible.map(run=>DB.prepare('INSERT OR IGNORE INTO instagram_sync_runs(id,task_id,dataset_id,finished_at) VALUES(?,?,?,?)').bind(run.id,task,run.defaultDatasetId,run.finishedAt)),DB.prepare("UPDATE instagram_sync SET discovery_offset=?,last_checked_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=1").bind(runs.length<20?0:state.discovery_offset+20),clear()]);
  run=await DB.prepare("SELECT * FROM instagram_sync_runs WHERE task_id=? AND state='pending' AND next_due_at<=unixepoch() ORDER BY finished_at,id LIMIT 1").bind(task).first();
  if(!run){await DB.prepare('UPDATE instagram_sync SET lease_token=NULL,lease_until=0,next_due_at=unixepoch()-((unixepoch()-120)%300)+300,last_error=NULL,failures=0 WHERE id=1 AND lease_token=?').bind(token).run();return {status:'idle'};}
  let count=run.item_count;
  if(count===null){const metadata=await apify(env,`datasets/${run.dataset_id}`,fetcher);count=metadata?.data?.itemCount;if(!Number.isSafeInteger(count)||count<0||count>1_000_000||metadata?.data?.id!==run.dataset_id)fail('apify_invalid_dataset');}
  const expected=Math.min(10,count-run.item_offset);if(expected<0)fail('apify_invalid_checkpoint');
  const rows=expected?await apify(env,`datasets/${run.dataset_id}/items?format=json&offset=${run.item_offset}&limit=10&clean=false&skipEmpty=false&skipHidden=false&fields=${fields}`,fetcher):[];
  if(!Array.isArray(rows)||rows.length!==expected)fail('apify_incomplete_page');
  const offset=run.item_offset+rows.length,complete=offset===count;
  const after=[DB.prepare("UPDATE instagram_sync_runs SET item_offset=?,item_count=?,state=?,last_error=NULL,failures=0,next_due_at=0,completed_at=CASE WHEN ? THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE NULL END WHERE id=?").bind(offset,count,complete?'complete':'pending',complete?1:0,run.id),DB.prepare("UPDATE instagram_sync SET last_success_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),last_error=NULL,failures=0,next_due_at=unixepoch()-((unixepoch()-120)%300)+300,lease_token=NULL,lease_until=0 WHERE id=1"),clear()];
  if(rows.length)await importInstagram(DB,rows,{before:[guard()],after});else await DB.batch([guard(),...after]);
  return {status:complete?'complete':'progress',runId:run.id,offset,total:count};
 }catch(error){
  const known=/^(apify_[a-z_]+(?:_\d{3})?|invalid_import|review_conflict)$/.test(error.message);
  const code=known?error.message:/CHECK constraint failed/i.test(String(error))?'sync_conflict':'sync_failure';
  await DB.batch([
   ...(run?[DB.prepare('UPDATE instagram_sync_runs SET last_error=?,failures=failures+1,next_due_at=unixepoch()+? WHERE id=? AND EXISTS(SELECT 1 FROM instagram_sync WHERE id=1 AND lease_token=?)').bind(code,Math.min(21600,1800*2**Math.min(run.failures,4)),run.id,token)]:[]),
   DB.prepare("UPDATE instagram_sync SET last_error=?,last_checked_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),failures=failures+1,next_due_at=unixepoch()+?,lease_token=NULL,lease_until=0 WHERE id=1 AND lease_token=?").bind(code,run?300:Math.min(1800,300*2**Math.min(state.failures,3)),token)
  ]);
  return {status:'retry',error:code};
 }
}
