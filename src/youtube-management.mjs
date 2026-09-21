import {youtubeStatus} from './youtube-collection.mjs';
import {addYouTubeChannel} from './youtube-sources.mjs';
import {parseYouTubeUrl,fetchYouTubeVideos,youtubeId,youtubeError} from './youtube-provider.mjs';
import {decisionSnapshot} from './youtube-store.mjs';
import {digest,auditGuard,requireActor} from './review-audit.mjs';
const categories=['fancam','appearance'],decisions=['pending','kept','excluded','held'],formats=['unknown','regular','shorts'];
const reasons={kept:['SEOYEON_CONFIRMED'],excluded:['SHORTS','GROUP_STAGE','NOT_SEOYEON','REUPLOAD','FAN_EDIT','OTHER'],held:['NEEDS_REVIEW'],pending:['NEEDS_REVIEW']};
const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
function enabled(env){if(env.YOUTUBE_ENABLED!=='true')throw youtubeError('youtube_disabled',503);}
async function requestIdentity(input,actor,payload){
 if(!actor?.id)throw youtubeError('access_denied',401);
 if(typeof input.requestId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId)||['actor','reviewedBy','reviewed_by'].some(k=>k in input))throw youtubeError('invalid_input',400);
 return {id:input.requestId.toLowerCase(),actor:actor.id,fingerprint:await digest(JSON.stringify(payload))};
}
async function replay(DB,r){const row=await DB.prepare('SELECT * FROM youtube_review_events WHERE request_id=?').bind(r.id).first();if(!row)return null;if(row.fingerprint!==r.fingerprint||row.reviewed_by!==r.actor)throw youtubeError('review_conflict',409);return {saved:true,existing:false,id:'yt:'+row.video_id,auditId:row.id};}
function eventStatement(DB,r,id,action,prev,next,reason,eventId){return DB.prepare('INSERT INTO youtube_review_events(id,request_id,fingerprint,video_id,action,previous_state,new_state,reviewed_by,reason_code) VALUES(?,?,?,?,?,?,?,?,?)').bind(eventId,r.id,r.fingerprint,id,action,JSON.stringify(prev),JSON.stringify(next),r.actor,reason);}
export async function previewYouTube(env,{url},options={}){
 enabled(env);const parsed=parseYouTubeUrl(url);const {videos}=await fetchYouTubeVideos(env,[parsed.videoId],{...options,budget:'manual'});if(!videos.length)throw youtubeError('unavailable',422);
 const existing=await env.DB.prepare('SELECT decision,revision FROM youtube_videos WHERE video_id=?').bind(parsed.videoId).first();return {...videos[0],existing:existing??null};
}
export async function registerYouTube(env,input,actor,options={}){
 enabled(env);const {videoId}=parseYouTubeUrl(input.url);
 if(!categories.includes(input.category)||input.confirmedRegular!==true)throw youtubeError('invalid_input',400);
 const r=await requestIdentity(input,actor,['register',videoId,input.category]),DB=env.DB;const old=await replay(DB,r);if(old)return old;
 const existing=await DB.prepare('SELECT decision FROM youtube_videos WHERE video_id=?').bind(videoId).first();if(existing)return {saved:false,existing:true,id:'yt:'+videoId,decision:existing.decision};
 const {videos}=await fetchYouTubeVideos(env,[videoId],{...options,budget:'manual'});if(!videos.length)throw youtubeError('unavailable',422);
 const eventId=crypto.randomUUID(),guard=auditGuard(DB,'NOT EXISTS(SELECT 1 FROM youtube_videos WHERE video_id=?)',[videoId]);
 try{await DB.batch([guard.statement,DB.prepare("INSERT INTO youtube_videos(video_id,metadata_json,metadata_fetched_at,decision,category,format,manual,revision,reviewed_at) VALUES(?,?,unixepoch(),'kept',?,'regular',1,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'))").bind(videoId,JSON.stringify(videos[0]),input.category),eventStatement(DB,r,videoId,'KEEP',null,{decision:'kept',category:input.category,format:'regular',revision:1},'SEOYEON_CONFIRMED',eventId),guard.cleanup]);}
 catch(error){const again=await replay(DB,r);if(again)return again;if(/CHECK constraint failed/.test(String(error))){const row=await DB.prepare('SELECT decision FROM youtube_videos WHERE video_id=?').bind(videoId).first();if(row)return {saved:false,existing:true,id:'yt:'+videoId,decision:row.decision};}throw youtubeError('save_failed');}
 return {saved:true,existing:false,id:'yt:'+videoId,auditId:eventId};
}
export async function reviewYouTube(env,id,input,actor){
 enabled(env);if(!youtubeId(id)||!Number.isSafeInteger(input.revision)||input.revision<0||!decisions.includes(input.decision)||!formats.includes(input.format)||input.category!==null&&!categories.includes(input.category)||!reasons[input.decision].includes(input.reasonCode)||input.decision==='kept'&&(input.format!=='regular'||!categories.includes(input.category)))throw youtubeError('invalid_input',400);
 const r=await requestIdentity(input,actor,['review',id,input.revision,input.decision,input.category,input.format,input.reasonCode]),DB=env.DB;const old=await replay(DB,r);if(old)return old;
 const row=await DB.prepare('SELECT * FROM youtube_videos WHERE video_id=?').bind(id).first();if(!row)throw youtubeError('not_found',404);if(row.revision!==input.revision)throw youtubeError('review_conflict',409);
 if(input.decision==='kept'&&(row.availability!=='available'||!row.metadata_json||row.metadata_fetched_at<=Date.now()/1000-2592000))throw youtubeError('unavailable',422);
 const next={decision:input.decision,category:input.category,format:input.format,revision:row.revision+1};
 const guard=auditGuard(DB,"EXISTS(SELECT 1 FROM youtube_videos WHERE video_id=? AND revision=? AND (?!='kept' OR (availability='available' AND metadata_json IS NOT NULL AND metadata_fetched_at>unixepoch()-2592000)))",[id,row.revision,input.decision]),eventId=crypto.randomUUID();
 try{await DB.batch([guard.statement,DB.prepare("UPDATE youtube_videos SET decision=?,category=?,format=?,revision=revision+1,reviewed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE video_id=? AND revision=?").bind(next.decision,next.category,next.format,id,row.revision),eventStatement(DB,r,id,{kept:'KEEP',excluded:'EXCLUDE',held:'HOLD',pending:'RESET_PENDING'}[input.decision],decisionSnapshot(row),next,input.reasonCode,eventId),guard.cleanup]);}
 catch(error){const again=await replay(DB,r);if(again)return again;throw youtubeError(/CHECK constraint failed/.test(String(error))?'review_conflict':'save_failed',/CHECK constraint failed/.test(String(error))?409:503);}
 return {saved:true,existing:false,id:'yt:'+id,auditId:eventId};
}
export async function listYouTube(env,params){
 const state=params.get('state')||'pending';if(![...decisions,'all'].includes(state))throw youtubeError('invalid_input',400);
 const conditions=[],args=[];if(state!=='all'){conditions.push('decision=?');args.push(state);}
 if(params.has('cursor')){let c;try{c=JSON.parse(atob(params.get('cursor')));}catch{throw youtubeError('invalid_input',400);}if(!c||c.state!==state||!youtubeId(c.id)||typeof c.date!=='string'||!Number.isFinite(Date.parse(c.date)))throw youtubeError('invalid_input',400);conditions.push('(created_at<? OR (created_at=? AND video_id>?))');args.push(c.date,c.date,c.id);}
 const rows=(await env.DB.prepare('SELECT * FROM youtube_videos'+(conditions.length?' WHERE '+conditions.join(' AND '):'')+' ORDER BY created_at DESC,video_id ASC LIMIT 26').bind(...args).all()).results;
 const page=rows.slice(0,25),last=page.at(-1);const discoveries=(await env.DB.prepare('SELECT video_id,source_key FROM youtube_discoveries WHERE video_id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(page.map(r=>r.video_id))).all()).results;const counts=(await env.DB.prepare('SELECT decision,count(*) count FROM youtube_videos GROUP BY decision').all()).results;
 return {enabled:env.YOUTUBE_ENABLED==='true',posts:page.map(r=>({videoId:r.video_id,url:'https://www.youtube.com/watch?v='+r.video_id,metadata:r.metadata_json?JSON.parse(r.metadata_json):null,decision:r.decision,category:r.category,format:r.format,revision:r.revision,availability:r.availability,manual:!!r.manual,discoveries:discoveries.filter(d=>d.video_id===r.video_id).map(d=>d.source_key)})),counts,nextCursor:rows.length>25?btoa(JSON.stringify({state,date:last.created_at,id:last.video_id})):null};
}
async function body(request){const reader=request.body?.getReader();if(!reader)throw youtubeError('invalid_input',400);const chunks=[];let n=0;while(true){const r=await reader.read();if(r.done)break;n+=r.value.length;if(n>8192){await reader.cancel();throw youtubeError('invalid_input',400);}chunks.push(r.value);}const b=new Uint8Array(n);let at=0;for(const c of chunks){b.set(c,at);at+=c.length;}try{const v=JSON.parse(new TextDecoder().decode(b));if(!v||Array.isArray(v)||typeof v!=='object')throw Error();return v;}catch{throw youtubeError('invalid_input',400);}}
export async function handleYouTube(request,env,context){
 try{
  const actor=requireActor(context),u=new URL(request.url);
  if(request.method==='GET'&&u.pathname==='/api/youtube/status')return reply(await youtubeStatus(env));
  if(request.method==='GET'&&u.pathname==='/api/youtube/review')return reply(await listYouTube(env,u.searchParams));
  if(request.headers.get('origin')!==u.origin||request.headers.get('x-management-action')!=='manage')throw youtubeError('invalid_origin',403);
  if(!request.headers.get('content-type')?.startsWith('application/json'))throw youtubeError('invalid_input',400);
  const input=await body(request);
  if(request.method==='POST'&&u.pathname==='/api/youtube/channels'){enabled(env);return reply(await addYouTubeChannel(env,input));}
  if(request.method==='POST'&&u.pathname==='/api/youtube/resume'){await env.DB.prepare('UPDATE youtube_control SET blocked_until=0,last_error_code=NULL WHERE id=1').run();return reply({saved:true});}
  if(request.method==='POST'&&['/api/youtube/preview','/api/youtube/posts'].includes(u.pathname)){
   const minute=String(Math.floor(Date.now()/60000));const reserved=await env.DB.prepare("INSERT INTO youtube_api_budget(day,bucket,calls) VALUES(?,'manual-rate',1) ON CONFLICT(day,bucket) DO UPDATE SET calls=calls+1 WHERE calls<10 RETURNING calls").bind(minute).first();if(!reserved)throw youtubeError('rate_limited',429);
   return reply(u.pathname.endsWith('/preview')?await previewYouTube(env,input):await registerYouTube(env,input,actor));
  }
  const match=u.pathname.match(/^\/api\/youtube\/review\/([A-Za-z0-9_-]{11})$/);if(match&&request.method==='PATCH')return reply(await reviewYouTube(env,match[1],input,actor));
  return reply({error:'method_not_allowed'},405);
 }catch(error){console.warn('youtube_management_error',JSON.stringify({code:error.status?error.message:'save_failed',status:error.status??503}));return reply({error:error.status?error.message:'save_failed'},error.status??503);}
}
