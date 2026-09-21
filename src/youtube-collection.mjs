import {youtubeExclusionReason} from './youtube-relevance.mjs';
import {youtubeRequest,fetchYouTubeVideos,youtubeId,youtubeError} from './youtube-provider.mjs';
import {saveVideoStatement,unavailableStatement} from './youtube-store.mjs';
import {auditGuard} from './review-audit.mjs';
const iso=seconds=>new Date(seconds*1000).toISOString();
const safe=error=>['not_configured','provider_access','quota_exceeded','rate_limited','provider_network','invalid_response','response_too_large','provider_failure','repeated_cursor'].includes(error?.message)?error.message:'save_failed';
async function block(env,error,now){const code=safe(error);const until=code==='provider_access'||code==='not_configured'?2147483647:now+(code==='quota_exceeded'?86400:300);await env.DB.prepare('UPDATE youtube_control SET blocked_until=?,last_error_code=? WHERE id=1').bind(until,code).run();return code;}
export async function collectYouTube(env,{now=Math.floor(Date.now()/1000),fetcher=fetch}={}){
 if(env.YOUTUBE_ENABLED!=='true'||env.YOUTUBE_COLLECTION_ENABLED!=='true')return {status:'disabled'};
 const DB=env.DB,control=await DB.prepare('SELECT blocked_until FROM youtube_control WHERE id=1').first();if(control.blocked_until>now)return {status:'blocked'};
 // Historical work yields to current sources and reserves four search calls for them.
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const token=crypto.randomUUID();const source=await DB.prepare(`UPDATE youtube_sources SET lease_token=?,lease_until=?,window_start=COALESCE(window_start,?),window_end=COALESCE(window_end,?) WHERE source_key=(SELECT source_key FROM youtube_sources WHERE enabled=1 AND next_due_at<=? AND lease_until<=? AND (backfill_handle IS NULL OR (
 (SELECT count(*) FROM youtube_videos WHERE decision='pending')<20
 AND COALESCE((SELECT calls FROM youtube_api_budget WHERE day=? AND bucket='search'),0)<8
 AND NOT EXISTS(SELECT 1 FROM youtube_sources active WHERE active.backfill_handle IS NOT NULL AND (active.last_success_at>? OR active.lease_until>?))
 )) ORDER BY backfill_handle IS NOT NULL,next_due_at,source_key LIMIT 1) RETURNING *`).bind(token,now+90,iso(now-30*86400),iso(now),now,now,day,now-21600,now).first();
 if(!source)return {status:'idle'};
 try{
  const backfill=!!source.backfill_handle;
  let data,playlist=source.playlist_id,channelId=source.backfill_channel_id;
  if(backfill&&!channelId){
   const channel=await youtubeRequest(env,'channels',{part:'id',forHandle:source.backfill_handle},{fetcher});
   channelId=channel.items[0]?.id;
   if(typeof channelId!=='string'||!/^UC[A-Za-z0-9_-]{22}$/.test(channelId))throw youtubeError('invalid_response');
  }
  if(source.kind==='search')data=await youtubeRequest(env,'search',{part:'snippet',type:'video',q:source.query,channelId:backfill?channelId:undefined,maxResults:backfill?10:50,order:'date',publishedAfter:source.window_start,publishedBefore:source.window_end,pageToken:source.page_token},{fetcher});
  else{
   if(!playlist){const channel=await youtubeRequest(env,'channels',{part:'contentDetails',id:source.query},{fetcher});playlist=channel.items[0]?.contentDetails?.relatedPlaylists?.uploads;if(typeof playlist!=='string'||!/^UU[A-Za-z0-9_-]{22}$/.test(playlist))throw youtubeError('invalid_response');}
   data=await youtubeRequest(env,'playlistItems',{part:'contentDetails',playlistId:playlist,maxResults:50,pageToken:source.page_token},{fetcher});
  }
  const cutoff=source.kind==='channel'&&data.items.some(item=>item.contentDetails?.videoPublishedAt&&item.contentDetails.videoPublishedAt<source.window_start);
  const items=source.kind==='channel'?data.items.filter(item=>!item.contentDetails?.videoPublishedAt||item.contentDetails.videoPublishedAt>=source.window_start):data.items;
  const ids=items.map(item=>source.kind==='search'?item.id?.videoId:item.contentDetails?.videoId);if(!ids.every(youtubeId))throw youtubeError('invalid_response');
  if(data.nextPageToken&&data.nextPageToken===source.page_token)throw youtubeError('repeated_cursor');
  const result=ids.length?await fetchYouTubeVideos(env,[...new Set(ids)],{fetcher}):{videos:[],unavailableIds:[]};
  const known=new Set((await DB.prepare('SELECT video_id FROM youtube_videos WHERE video_id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(ids)).all()).results.map(r=>r.video_id));
  const channels=new Set((await DB.prepare("SELECT query FROM youtube_sources WHERE kind='channel' AND enabled=1").all()).results.map(r=>r.query));
  const rejected=new Set([...result.videos.filter(v=>!known.has(v.videoId)&&(youtubeExclusionReason(v,{registeredChannel:!backfill&&channels.has(v.channelId)})||backfill&&(!/(?:윤서연|트리플에스|\btriple\s*s\b)/iu.test(v.title.normalize('NFKC').replace(/#[^\s#]+/gu,''))||v.channelId!==channelId||v.publishedAt<source.window_start||v.publishedAt>=source.window_end||/단체|전체\s*캠|full\s*cam/i.test(v.title)))).map(v=>v.videoId),...result.unavailableIds.filter(id=>!known.has(id))]);
  result.unavailableIds=result.unavailableIds.filter(id=>!rejected.has(id));
  result.videos=result.videos.filter(v=>!rejected.has(v.videoId));
  const next=cutoff?null:data.nextPageToken||null,guard=auditGuard(DB,'EXISTS(SELECT 1 FROM youtube_sources WHERE source_key=? AND lease_token=? AND lease_until>unixepoch() AND enabled=1 AND revision=?)',[source.source_key,token,source.revision]);
  const statements=[guard.statement,...result.videos.map(v=>saveVideoStatement(DB,v,now)),...result.unavailableIds.map(id=>unavailableStatement(DB,id,now))];
  for(const id of new Set(ids.filter(id=>!rejected.has(id))))statements.push(DB.prepare('INSERT INTO youtube_discoveries(video_id,source_key,first_seen_at,last_seen_at) VALUES(?,?,?,?) ON CONFLICT(video_id,source_key) DO UPDATE SET last_seen_at=excluded.last_seen_at').bind(id,source.source_key,now,now));
  // One page per tick. Search budgets bound subsequent ticks; unfinished windows retain their cursor.
  const delay=backfill?86400:next?(source.pages%2===1?43200:300):source.kind==='search'?43200:21600;
  const completed=backfill&&!next&&source.window_end>=source.backfill_until;
  const windowStart=next?source.window_start:backfill?source.window_end:iso(now-7*86400);
  const yearEnd=backfill?new Date(Date.UTC(new Date(windowStart).getUTCFullYear()+1,0,1)).toISOString():null;
  const windowEnd=next?source.window_end:backfill?(yearEnd<source.backfill_until?yearEnd:source.backfill_until):null;
  statements.push(DB.prepare('UPDATE youtube_sources SET backfill_channel_id=?,enabled=?,page_token=?,playlist_id=?,pages=?,window_start=?,window_end=?,next_due_at=?,last_success_at=?,last_error_code=NULL,lease_token=NULL,lease_until=0 WHERE source_key=? AND lease_token=?').bind(channelId??null,completed?0:source.enabled,next,playlist,next?source.pages+1:0,windowStart,windowEnd,now+delay,now,source.source_key,token),guard.cleanup);
  await DB.batch(statements);return {status:next?'partial':'ok',count:ids.length,filtered:rejected.size};
 }catch(error){const code=await block(env,error,now);await DB.prepare('UPDATE youtube_sources SET last_error_code=?,next_due_at=?,lease_token=NULL,lease_until=0 WHERE source_key=? AND lease_token=?').bind(code,now+300,source.source_key,token).run();return {status:'failed',error:code};}
}
export async function refreshYouTube(env,{now=Math.floor(Date.now()/1000),fetcher=fetch}={}){
 const DB=env.DB;
 await DB.prepare("UPDATE youtube_videos SET metadata_json=NULL,availability='expired' WHERE metadata_json IS NOT NULL AND metadata_fetched_at<=?").bind(now-2592000).run();
 await DB.prepare("DELETE FROM youtube_api_budget WHERE (bucket='manual-rate' AND CAST(day AS INTEGER)<?) OR (bucket!='manual-rate' AND day<?)").bind(Math.floor(now/60)-60,iso(now-7*86400).slice(0,10)).run();
 if(env.YOUTUBE_ENABLED!=='true')return {status:'disabled'};
 const token=crypto.randomUUID(),claim=await DB.prepare('UPDATE youtube_control SET refresh_token=?,refresh_until=? WHERE id=1 AND refresh_until<=? AND refresh_due_at<=? AND blocked_until<=? RETURNING id').bind(token,now+90,now,now,now).first();if(!claim)return {status:'idle'};
 try{
  const ids=(await DB.prepare('SELECT video_id FROM youtube_videos WHERE metadata_fetched_at<=? ORDER BY metadata_fetched_at,video_id LIMIT 50').bind(now-604800).all()).results.map(r=>r.video_id);
  const result=ids.length?await fetchYouTubeVideos(env,ids,{fetcher}):{videos:[],unavailableIds:[]};
  const guard=auditGuard(DB,'EXISTS(SELECT 1 FROM youtube_control WHERE id=1 AND refresh_token=? AND refresh_until>unixepoch())',[token]);
  await DB.batch([guard.statement,...result.videos.map(v=>saveVideoStatement(DB,v,now)),...result.unavailableIds.map(id=>unavailableStatement(DB,id,now)),DB.prepare('UPDATE youtube_control SET refresh_token=NULL,refresh_until=0,refresh_due_at=?,last_refresh_at=?,last_error_code=NULL WHERE id=1 AND refresh_token=?').bind(now+(ids.length===50?300:3600),now,token),guard.cleanup]);return {status:'ok',count:ids.length};
 }catch(error){const code=await block(env,error,now);await DB.prepare('UPDATE youtube_control SET refresh_token=NULL,refresh_until=0,refresh_due_at=? WHERE id=1 AND refresh_token=?').bind(now+300,token).run();return {status:'failed',error:code};}
}
export async function youtubeStatus(env){
 const sources=(await env.DB.prepare('SELECT source_key,kind,enabled,backfill_handle,window_start,window_end,backfill_until,last_success_at,next_due_at,last_error_code,page_token IS NOT NULL AS partial FROM youtube_sources ORDER BY source_key').all()).results;
 const counts=await env.DB.prepare("SELECT count(*) total,count(CASE WHEN decision='pending' THEN 1 END) pending FROM youtube_videos").first();
 const control=await env.DB.prepare('SELECT last_refresh_at,last_error_code,blocked_until FROM youtube_control WHERE id=1').first();
 return {enabled:env.YOUTUBE_ENABLED==='true',collectionEnabled:env.YOUTUBE_COLLECTION_ENABLED==='true',configured:!!env.YOUTUBE_API_KEY,sources,...counts,...control};
}
