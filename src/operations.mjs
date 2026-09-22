import {readYouTubeOperations} from './youtube-operations.mjs';
import {sources} from './sources.mjs';
import {readOperationsHistory} from './operations-history.mjs';
import {readOperationsAlerts} from './operations-alerts.mjs';

const grace=900;
const historyNotes=new Set(['history_window_unverified','unverified_exhaustion','repeated_cursor']);
const knownErrors=new Set(['unknown_source','unexpected_204','provider_schema','provider_timeout','provider_network','cursor_expired','storage_error','repeated_cursor','unverified_exhaustion','history_window_unverified','invalid_json','response_too_large','invalid_import','review_conflict','sync_conflict','sync_failure','apify_network','apify_empty_response','apify_response_too_large','apify_invalid_json','apify_invalid_runs','apify_invalid_dataset','apify_invalid_checkpoint','apify_incomplete_page']);
const safeError=value=>!value?null:knownErrors.has(value)||/^(?:provider_http(?:_error)?|provider_json_error|invalid_json|response_too_large|unexpected_204):[1-5][0-9]{2}$/.test(value)||/^apify_http_[1-5][0-9]{2}$/.test(value)?value:'unknown_error';
function seconds(value){
 if(value===null||value===undefined||value==='')return null;
 const n=typeof value==='number'?value:Date.parse(value)/1000;
 return Number.isFinite(n)&&n>0?n:null;
}
const iso=value=>{const n=seconds(value);return n===null?null:new Date(n*1000).toISOString();};
const late=(due,fallback,now,allowance=grace)=>{const at=seconds(due)??seconds(fallback);return at!==null&&now-at>allowance;};
const json=(data,status=200,headers={})=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store',...headers}});

function xSource(row,enabled,now,allowance){
 const active=enabled&&row.enabled===1;
 const historyNote=historyNotes.has(row.last_error_code);
 const historyStatus=row.catchup_status==='limited'?'limited':row.history_paused||row.catchup_status==='gap'||historyNote?'unverified':row.last_complete_sync_at?'verified':'pending';
 const historyOnly=sources.some(source=>source.handle===row.source&&source.historyOnly);
 const completed=historyOnly&&!row.enabled&&!row.failures&&
  (row.last_complete_sync_at||row.history_paused&&row.last_success_at&&['limited','gap','idle'].includes(row.catchup_status));
 let status='waiting';
 if(completed)status='completed';
 else if(!active)status='disabled';
 else if(row.lease_until>now)status='running';
 else if(row.catchup_status==='needs_attention')status='attention';
 else if(late(row.next_due_at,row.last_attempt_at??row.last_success_at,now,allowance))status='delayed';
 else if(row.failures||row.catchup_status==='retry'||row.last_error_code&&!historyNote)status='retry';
 else if(row.last_success_at)status='healthy';
 return {source:row.source,status,historyStatus,historyReason:historyNote?row.last_error_code:null,enabled:active,lastAttemptAt:iso(row.last_attempt_at),lastSuccessAt:iso(row.last_success_at),lastCompleteSyncAt:iso(row.last_complete_sync_at),nextDueAt:iso(row.next_due_at),failures:row.failures,error:historyNote?null:safeError(row.last_error_code)};
}

export async function readOperationsState(env,{details=true}={}){
  const {DB}=env;
  const {now}=await DB.prepare('SELECT unixepoch() AS now').first();
  const configured=!!env.APIFY_TOKEN&&typeof env.APIFY_TASK_ID==='string'&&/^[A-Za-z0-9]{3,64}$/.test(env.APIFY_TASK_ID);
  const task=configured?env.APIFY_TASK_ID:'';
  const [control,xRows,ig,runs,manualRows,manualDue,totals,history,youtube]=await Promise.all([
   DB.prepare('SELECT enabled FROM collection_control WHERE id=1').first(),
   DB.prepare('SELECT source,enabled,last_attempt_at,last_success_at,last_complete_sync_at,next_due_at,lease_until,failures,last_error_code,catchup_status,history_paused FROM collection_state ORDER BY source').all(),
   DB.prepare('SELECT task_id,last_checked_at,last_success_at,next_due_at,lease_until,failures,last_error FROM instagram_sync WHERE id=1').first(),
   DB.prepare("SELECT COUNT(*) AS pending,COUNT(CASE WHEN last_error IS NOT NULL THEN 1 END) AS errors,COUNT(CASE WHEN (CASE WHEN next_due_at>0 THEN next_due_at ELSE COALESCE(unixepoch((SELECT last_checked_at FROM instagram_sync WHERE id=1 AND task_id=?)),unixepoch(finished_at)) END)<? THEN 1 END) AS overdue FROM instagram_sync_runs WHERE task_id=? AND state='pending'").bind(task,now-grace,task).first(),
   DB.prepare('SELECT state,COUNT(*) AS count FROM manual_media_jobs GROUP BY state').all(),
   DB.prepare("SELECT COUNT(*) AS count FROM manual_media_jobs WHERE state IN ('pending','starting','waiting') AND lease_until<=? AND (CASE WHEN next_due_at>0 THEN next_due_at ELSE updated_at END)>0 AND (CASE WHEN next_due_at>0 THEN next_due_at ELSE updated_at END)<?").bind(now,now-grace).first(),
   details?DB.prepare('SELECT (SELECT COUNT(*) FROM posts) AS x,(SELECT COUNT(*) FROM instagram_review) AS instagram,(SELECT COUNT(*) FROM manual_posts) AS manual,(SELECT COUNT(*) FROM youtube_videos) AS youtube').first():null,
   details?readOperationsHistory(DB,now*1000).then(data=>({status:'ok',...data})).catch(()=>({status:'unavailable',items:[]})):null,
   readYouTubeOperations(env,now).catch(()=>({status:'unavailable'}))
  ]);
  const enabled=env.COLLECTION_ENABLED==='true'&&control?.enabled===1;
  // X runs one eligible source every three minutes, so allow one full rotation.
  const xGrace=Math.max(grace,xRows.results.filter(row=>enabled&&row.enabled===1&&row.catchup_status!=='needs_attention').length*180);
  const igEnabled=env.APIFY_SYNC_ENABLED==='true'&&configured;
  const mismatch=igEnabled&&ig&&ig.task_id!==task;
  const running=igEnabled&&!mismatch&&ig?.lease_until>now;
  const overdue=igEnabled&&!mismatch&&!running&&!(ig?.next_due_at>now)?runs.overdue:0;
  let status='waiting';
  if(env.APIFY_SYNC_ENABLED!=='true')status='disabled';
  else if(!configured)status='unconfigured';
  else if(mismatch)status='attention';
  else if(running)status='running';
  else if(late(ig?.next_due_at,ig?.last_checked_at??ig?.last_success_at,now)||overdue)status='delayed';
  else if(ig?.last_error||ig?.failures||runs.errors)status='retry';
  else if(ig?.last_checked_at||ig?.last_success_at)status='healthy';
  const counts={pending:0,starting:0,waiting:0,ready:0,no_media:0,failed:0,existing:0};
  for(const row of manualRows.results)if(Object.hasOwn(counts,row.state))counts[row.state]=row.count;
  const manualEnabled=env.MANUAL_MEDIA_ENABLED==='true';
  return {generatedAt:iso(now),delayGraceSeconds:grace,youtube,
   x:{enabled,delayGraceSeconds:xGrace,sources:xRows.results.map(row=>xSource(row,enabled,now,xGrace))},
   instagram:{status,checkedAt:iso(ig?.last_checked_at),syncedAt:iso(ig?.last_success_at),nextDueAt:iso(ig?.next_due_at),failures:ig?.failures??0,error:mismatch?'task_mismatch':safeError(ig?.last_error),pending:runs.pending,pendingErrors:runs.errors,overdue,pendingOverdue:igEnabled&&!mismatch?runs.overdue:0},
   manual:{enabled:manualEnabled,counts,overdue:manualEnabled?manualDue.count:0},...(details?{totals,history}:{})};
}

export async function handleOperations(request,env){
 if(request.method!=='GET')return json({error:'method_not_allowed'},405,{Allow:'GET'});
 try{
  const [data,alerts]=await Promise.all([
   readOperationsState(env),
   readOperationsAlerts(env.DB).catch(()=>({status:'unavailable',checkedAt:null,active:[],events:[]}))
  ]);
  return json({...data,alerts});
 }catch{return json({error:'operations_unavailable'},503);}
}
