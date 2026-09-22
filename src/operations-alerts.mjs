import {sources} from './sources.mjs';

const badStatuses=new Set(['retry','attention','delayed','unconfigured']);
const labels=new Map([...sources.map(({handle})=>['x:'+handle,'X · '+handle]),['youtube','YouTube 수집'],['instagram','Instagram 수집'],['manual','직접 등록 사진'],['history','일별 운영 기록']]);
const iso=value=>value===null||value===undefined?null:new Date(value*1000).toISOString();
const statusOf=status=>badStatuses.has(status)?'bad':status==='healthy'?'healthy':['disabled','completed'].includes(status)?'stopped':'unknown';

function historySignal(row,now){
 const today=new Date(now+9*3600000).toISOString().slice(0,10);
 const midnight=Date.parse(today+'T00:00:00+09:00');
 const capture=Date.parse(row?.captured_at);
 if(row?.day===today&&capture>=midnight&&capture<=now)return row.query_status==='ok'?'healthy':row.query_status==='failed'?'bad':'unknown';
 if(now>=midnight+(2*3600+5*60)*1000)return 'bad';
 const yesterday=new Date(midnight-86400000+9*3600000).toISOString().slice(0,10);
 // A stale failure is no evidence of recovery across the next day's grace period.
 return row?.day===yesterday&&capture>=midnight-86400000&&capture<midnight&&row.query_status==='ok'?'healthy':'unknown';
}

function observations(signals,history,now){
 const result=new Map([...labels.keys()].map(key=>[key,'unknown']));
 for(const row of signals?.x?.sources??[]){const key='x:'+row.source;if(labels.has(key))result.set(key,statusOf(row.status));}
 if(signals?.youtube)result.set('youtube',statusOf(signals.youtube.status));
 const ig=signals?.instagram;
 if(ig)result.set('instagram',['disabled','completed'].includes(ig.status)?'stopped':ig.pendingErrors>0||ig.overdue>0||ig.pendingOverdue>0?'bad':statusOf(ig.status));
 const manual=signals?.manual;
 if(manual?.enabled===false)result.set('manual','stopped');
 else if(manual?.enabled===true)result.set('manual',manual.counts?.failed>0||manual.overdue>0?'bad':typeof manual.counts?.failed==='number'&&typeof manual.overdue==='number'?'healthy':'unknown');
 result.set('history',historySignal(history,now));
 return result;
}

export async function evaluateOperationsAlerts(env,loadSignals,now=Date.now()){
 const {DB}=env,at=Math.floor(now/1000),token=crypto.randomUUID();
 const lease=await DB.prepare(`UPDATE operations_alert_monitor SET lease_token=?,lease_until=unixepoch()+120,last_attempt_at=?
  WHERE id=1 AND lease_until<=unixepoch() AND (checked_at IS NULL OR checked_at<?)`)
  .bind(token,at,at).run();
 if(lease.meta?.changes!==1)return {status:'skipped'};
 let failed=false,committed=false;
 try{
  const signals=await loadSignals();
  const [stored,history,monitor]=await Promise.all([
   DB.prepare('SELECT key,label,opened_at,last_seen_at,bad_since,healthy_since,observed_at FROM operations_alert_state').all(),
   DB.prepare('SELECT day,captured_at,query_status FROM operations_history ORDER BY day DESC LIMIT 1').first(),
   DB.prepare('SELECT last_failure_at FROM operations_alert_monitor WHERE id=1').first()
  ]);
  const states=new Map(stored.results.map(row=>[row.key,row]));
  const statements=[],transitions=[];
  // A named CHECK deliberately aborts the whole D1 batch if ownership expired.
  // Guards at both ends protect events, state and heartbeat even if the lease
  // expires during SQL execution; no partially committed transitions survive.
  statements.push(DB.prepare(`UPDATE operations_alert_monitor SET lease_until=CASE WHEN lease_token=? AND lease_until>unixepoch() THEN lease_until ELSE -1 END WHERE id=1`).bind(token));
  for(const [key,observation] of observations(signals,history,now)){
   const old=states.get(key);
   let opened=old?.opened_at??null,lastSeen=old?.last_seen_at??null;
   const continuous=old&&at>old.observed_at&&at-old.observed_at<=900&&(monitor.last_failure_at===null||old.observed_at>=monitor.last_failure_at);
   let bad=continuous?old.bad_since:null,healthy=continuous?old.healthy_since:null,type=null;
   if(observation==='bad'){
    healthy=null;bad??=at;
    if(opened!==null)lastSeen=at;
    else if(at>bad&&at-bad>=900){opened=at;lastSeen=at;type='problem';}
   }else if(observation==='healthy'){
    bad=null;
    if(opened!==null){healthy??=at;if(at>healthy&&at-healthy>=300){opened=null;healthy=null;type='recovered';}}
    else healthy=null;
   }else{
    bad=null;healthy=null;
    if(observation==='stopped'&&opened!==null){opened=null;type='stopped';}
   }
   statements.push(DB.prepare(`INSERT INTO operations_alert_state(key,label,opened_at,last_seen_at,bad_since,healthy_since,observed_at)
    VALUES(?,?,?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET label=excluded.label,opened_at=excluded.opened_at,last_seen_at=excluded.last_seen_at,bad_since=excluded.bad_since,healthy_since=excluded.healthy_since,observed_at=excluded.observed_at`)
    .bind(key,labels.get(key),opened,lastSeen,bad,healthy,at));
   if(type){statements.push(DB.prepare('INSERT INTO operations_alert_events(key,label,type,created_at) VALUES(?,?,?,?)').bind(key,labels.get(key),type,at));transitions.push({key,type});}
  }
  statements.push(DB.prepare(`UPDATE operations_alert_monitor SET checked_at=?,lease_until=CASE WHEN lease_token=? AND lease_until>unixepoch() THEN 0 ELSE -1 END,lease_token=NULL WHERE id=1`).bind(at,token));
  await DB.batch(statements);
  committed=true;
  return {status:'checked',checkedAt:iso(at),transitions};
 }catch(error){
  failed=true;
  if(String(error?.message).includes('operations_alert_lease_valid'))return {status:'skipped'};
  throw error;
 }finally{
  // The token prevents an expired worker from releasing its successor's lease.
  if(!committed)await DB.prepare('UPDATE operations_alert_monitor SET lease_token=NULL,lease_until=0,last_failure_at=CASE WHEN ? THEN ? ELSE last_failure_at END WHERE id=1 AND lease_token=?').bind(failed?1:0,at,token).run();
 }
}

export async function readOperationsAlerts(DB,now=Date.now()){
 // One SELECT snapshot prevents mixing a heartbeat from one commit with events
 // from another. The event LIMIT is applied before combining the three sets.
 const {results}=await DB.prepare(`SELECT 'monitor' AS kind,NULL AS id,NULL AS key,NULL AS label,NULL AS type,NULL AS opened_at,NULL AS last_seen_at,NULL AS created_at,checked_at,last_attempt_at FROM operations_alert_monitor WHERE id=1
  UNION ALL SELECT 'active',NULL,key,label,NULL,opened_at,last_seen_at,NULL,NULL,NULL FROM operations_alert_state WHERE opened_at IS NOT NULL
  UNION ALL SELECT 'event',id,key,label,type,NULL,NULL,created_at,NULL,NULL FROM (SELECT id,key,label,type,created_at FROM operations_alert_events ORDER BY id DESC LIMIT 20)`).all();
 const monitor=results.find(row=>row.kind==='monitor');
 if(!monitor)throw Error('operations_alert_monitor_missing');
 return {status:'ok',checkedAt:iso(monitor.checked_at),lastAttemptAt:iso(monitor.last_attempt_at),stale:monitor.checked_at===null||now/1000-monitor.checked_at>900,
  active:results.filter(row=>row.kind==='active'&&labels.has(row.key)).sort((a,b)=>a.key.localeCompare(b.key)).map(row=>({key:row.key,label:labels.get(row.key),openedAt:iso(row.opened_at),lastSeenAt:iso(row.last_seen_at)})),
  events:results.filter(row=>row.kind==='event'&&labels.has(row.key)).sort((a,b)=>b.id-a.id).map(row=>({id:row.id,key:row.key,label:labels.get(row.key),type:row.type,createdAt:iso(row.created_at)}))};
}
