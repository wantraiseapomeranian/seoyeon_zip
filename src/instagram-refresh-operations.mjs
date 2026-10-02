const grace=900,daySeconds=86400;
const knownErrors=new Set(['start_uncertain','run_timeout','invalid_response','run_failed','dataset_shape','invalid_author','author_mismatch','ambiguous_asset','provider_network','provider_failure','provider_access','not_found','rate_limited','response_too_large','save_failed','refresh_conflict','partial_refresh']);
const iso=value=>Number.isFinite(value)&&value>0?new Date(value*1000).toISOString():null;
const safeError=value=>!value?null:knownErrors.has(value)?value:'unknown_error';
export const unavailableInstagramRefresh=()=>({status:'unavailable',refreshedAt:null,nextDueAt:null,error:null,startsToday:0,dailyStartLimit:2,failedPosts:0,overduePosts:0});

// Read only: the same public-photo predicate as the paid refresh scheduler.
// Internal run IDs, raw errors and signed media URLs never enter this response.
export async function readInstagramRefreshOperations(env,now){
 const result={...unavailableInstagramRefresh(),status:'waiting'};
 if(env.INSTAGRAM_MEDIA_REFRESH_ENABLED!=='true'||env.APIFY_SYNC_ENABLED!=='true')return {...result,status:'disabled'};
 if(!env.APIFY_TOKEN)return {...result,status:'unconfigured'};
 const [job,posts]=await Promise.all([
  env.DB.prepare('SELECT state,started_at,last_success_at,last_error,next_due_at,failures,lease_until,budget_day,starts_today FROM instagram_media_refresh WHERE id=1').first(),
  env.DB.prepare(`SELECT COUNT(*) AS total,
   COUNT(CASE WHEN f.failures>0 OR f.last_error IS NOT NULL THEN 1 END) AS failed,
   COUNT(CASE WHEN f.next_due_at>0 AND f.next_due_at<=? THEN 1 END) AS overdue,
   MIN(COALESCE(f.next_due_at,0)) AS next_due_at
   FROM instagram_review r LEFT JOIN instagram_media_refresh_posts f ON f.code=r.code
   WHERE r.status='kept' AND EXISTS(SELECT 1 FROM managed_feed_posts p,json_each(p.data,'$.media') m
    WHERE p.id='ig:'||r.code AND json_extract(m.value,'$.kind')='image')`).bind(now-grace).first()
 ]);
 if(!job)throw Error('instagram_refresh_state_missing');
 const today=Math.floor(now/daySeconds),startsToday=job.budget_day===today?job.starts_today:0;
 const budgetWait=job.state==='idle'&&startsToday>=2&&job.last_error==='daily_budget'&&job.next_due_at>=((today+1)*daySeconds)&&job.next_due_at>now;
 const active=job.lease_until>now,polling=job.state==='waiting';
 const due=polling?job.next_due_at:posts.total?Math.max(job.next_due_at,posts.next_due_at):job.next_due_at;
 // Partial errors belong to the visible failed posts. Hiding an old failed post
 // must not leave its historical aggregate marker as a perpetual alarm.
 const error=['partial_refresh','daily_budget'].includes(job.last_error)?null:safeError(job.last_error);
 let status='waiting';
 if(job.state==='error'||job.state==='starting'&&!active)status='attention';
 else if(active)status='running';
 else if(budgetWait)status='budget_wait';
 else if(posts.failed||job.failures||error)status='retry';
 else if((polling||posts.total)&&due>0&&now-due>=grace)status='delayed';
 else if(polling)status='running';
 else if(job.last_success_at)status='healthy';
 return {...result,status,refreshedAt:iso(job.last_success_at),nextDueAt:iso(due),error:job.state==='starting'&&!active?'start_uncertain':error,startsToday,failedPosts:posts.failed,overduePosts:posts.overdue};
}
