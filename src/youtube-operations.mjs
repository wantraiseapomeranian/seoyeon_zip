const iso=at=>at>0?new Date(at*1000).toISOString():null;
const errors=new Set(['not_configured','provider_access','quota_exceeded','rate_limited','provider_network','invalid_response','response_too_large','provider_failure','repeated_cursor','save_failed']);
const safeError=value=>!value?null:errors.has(value)?value:'unknown_error';
const bad=new Set(['retry','attention','delayed']);
const names={'search:ko-fancam':'한국어 직캠 검색','search:en-fancam':'영어 직캠 검색','search:appearance':'출연 영상 검색'};
export async function readYouTubeOperations(env,now){
 const DB=env.DB,day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now*1000));
 const [rows,control,counts,budget]=await Promise.all([
  DB.prepare('SELECT * FROM youtube_sources ORDER BY source_key').all(),
  DB.prepare('SELECT * FROM youtube_control WHERE id=1').first(),
  DB.prepare("SELECT count(*) total,count(CASE WHEN decision='pending' THEN 1 END) pending,count(CASE WHEN decision='kept' THEN 1 END) kept,count(CASE WHEN decision='held' THEN 1 END) held,count(CASE WHEN decision='excluded' THEN 1 END) excluded FROM youtube_videos").first(),
  DB.prepare("SELECT calls FROM youtube_api_budget WHERE day=? AND bucket='search'").bind(day).first()
 ]);
 const enabled=env.YOUTUBE_ENABLED==='true'&&env.YOUTUBE_COLLECTION_ENABLED==='true',configured=!!env.YOUTUBE_API_KEY,used=budget?.calls??0;
 const backfills=rows.results.filter(s=>s.backfill_handle),lastBackfill=Math.max(0,...backfills.map(s=>s.last_success_at||0));
 const cooldown=lastBackfill?lastBackfill+21600:0;
 const allowance=Math.max(900,rows.results.filter(s=>s.enabled&&!s.backfill_handle).length*300);
 const sources=rows.results.map(row=>{
  const historical=!!row.backfill_handle,completed=historical&&!row.enabled&&row.window_start>=row.backfill_until;
  const due=Math.max(row.next_due_at||0,historical?cooldown:0);
  let status='waiting';
  if(!enabled)status='disabled';
  else if(completed)status='completed';
  else if(!row.enabled)status='disabled';
  else if(!configured)status='unconfigured';
  else if(row.lease_until>now)status='running';
  else if(row.last_error_code)status=row.kind==='search'&&row.last_error_code==='quota_exceeded'&&used>=12?'quota_wait':'retry';
  else if(historical&&counts.pending>=20)status='review_wait';
  else if(row.kind==='search'&&used>=(historical?8:12))status='quota_wait';
  else if(historical&&due>now)status='scheduled';
  else if(due>0&&now-due>allowance)status='delayed';
  else if(row.last_success_at)status='healthy';
  return {key:row.source_key,label:names[row.source_key]??(historical?row.backfill_handle+' · 과거 직캠':row.query),mode:historical?'backfill':row.kind,status,lastSuccessAt:iso(row.last_success_at),nextDueAt:['disabled','completed','review_wait','quota_wait','unconfigured'].includes(status)?null:iso(due),windowStart:row.window_start,windowEnd:row.window_end,error:safeError(row.last_error_code)};
 });
 let status='waiting';
 const error=safeError(control?.last_error_code),blocked=control?.blocked_until>now;
 if(!enabled)status='disabled';
 else if(!configured)status='unconfigured';
 else if(blocked&&error==='quota_exceeded'&&used>=12&&!sources.some(s=>s.mode==='channel'&&s.status==='retry'))status='quota_wait';
 else if(blocked&&['not_configured','provider_access'].includes(error))status='attention';
 else if(blocked&&error)status='retry';
 else if(sources.some(s=>bad.has(s.status)))status=sources.some(s=>s.status==='delayed')?'delayed':'retry';
 else if(sources.some(s=>s.status==='running'))status='running';
 else if(sources.some(s=>s.status==='healthy'))status='healthy';
 else if(sources.length&&sources.every(s=>['disabled','completed'].includes(s.status)))status='disabled';
 else if(sources.some(s=>s.status==='quota_wait'))status='quota_wait';
 return {status,enabled,configured,counts,sources,error,search:{used,limit:12,day,timeZone:'America/Los_Angeles'},lastSuccessAt:iso(Math.max(0,...rows.results.map(s=>s.last_success_at||0))),refreshedAt:iso(control?.last_refresh_at),backfill:{total:backfills.length,completed:sources.filter(s=>s.mode==='backfill'&&s.status==='completed').length,waitingForReview:enabled&&counts.pending>=20}};
}
