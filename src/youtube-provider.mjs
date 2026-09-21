export const youtubeId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{11}$/.test(value);
export const youtubeError=(code,status=503)=>Object.assign(new Error(code),{status});
export function parseYouTubeUrl(input){
 let u;try{if(typeof input!=='string'||input.length>2048)throw Error();u=new URL(input.trim());}catch{throw youtubeError('invalid_url',400);}
 if(u.protocol!=='https:'||u.username||u.password||u.port)throw youtubeError('invalid_url',400);
 if(['youtube.com','www.youtube.com','m.youtube.com'].includes(u.hostname)&&u.pathname.startsWith('/shorts/'))throw youtubeError('shorts_not_supported',400);
 const id=u.hostname==='youtu.be'&&/^\/[A-Za-z0-9_-]{11}$/.test(u.pathname)?u.pathname.slice(1):['youtube.com','www.youtube.com','m.youtube.com'].includes(u.hostname)&&u.pathname==='/watch'&&u.searchParams.getAll('v').length===1?u.searchParams.get('v'):null;
 if(!youtubeId(id))throw youtubeError('invalid_url',400);
 return {videoId:id,canonicalUrl:`https://www.youtube.com/watch?v=${id}`};
}
export async function youtubeRequest(env,resource,params,{fetcher=fetch,budget='background'}={}){
 if(!env.YOUTUBE_API_KEY)throw youtubeError('not_configured');
 if(!['videos','search','channels','playlistItems'].includes(resource))throw youtubeError('invalid_input',400);
 if(env.DB){
  const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const bucket=resource==='search'?'search':'detail',limit=bucket==='search'?12:budget==='manual'?500:400;
  const r=await env.DB.prepare('INSERT INTO youtube_api_budget(day,bucket,calls) VALUES(?,?,1) ON CONFLICT(day,bucket) DO UPDATE SET calls=calls+1 WHERE calls<? RETURNING calls').bind(day,bucket,limit).first();
  if(!r)throw youtubeError('quota_exceeded');
 }
 const url=new URL('https://www.googleapis.com/youtube/v3/'+resource);for(const [key,value]of Object.entries(params))if(value!==null&&value!==undefined)url.searchParams.set(key,String(value));
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
 try{
  const response=await fetcher(url.href,{headers:{'x-goog-api-key':env.YOUTUBE_API_KEY},signal:controller.signal,redirect:'error'});
  const reader=response.body?.getReader();let size=0;const chunks=[];
  if(reader)while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2*1024*1024){await reader.cancel();throw youtubeError('response_too_large');}chunks.push(value);}
  const bytes=new Uint8Array(size);let pos=0;for(const chunk of chunks){bytes.set(chunk,pos);pos+=chunk.byteLength;}
  let data;try{data=JSON.parse(new TextDecoder().decode(bytes));}catch{throw youtubeError('invalid_response');}
  if(!response.ok){const known=['quotaExceeded','dailyLimitExceeded','keyInvalid','accessNotConfigured','ipRefererBlocked','forbidden','API_KEY_INVALID','API_KEY_SERVICE_BLOCKED','API_KEY_HTTP_REFERRER_BLOCKED','API_KEY_IP_ADDRESS_BLOCKED','SERVICE_DISABLED'];const reasons=[...(data?.error?.errors||[]),...(data?.error?.details||[])].map(e=>e.reason).filter(r=>known.includes(r));console.warn('youtube_provider_error',JSON.stringify({resource,status:response.status,reasons}));const quota=data?.error?.errors?.some(e=>['quotaExceeded','dailyLimitExceeded'].includes(e.reason));throw youtubeError(quota?'quota_exceeded':response.status===429?'rate_limited':[401,403].includes(response.status)?'provider_access':'provider_failure');}
  if(!Array.isArray(data.items)||data.items.length>50||data.nextPageToken!==undefined&&(typeof data.nextPageToken!=='string'||data.nextPageToken.length>2048))throw youtubeError('invalid_response');
  return data;
 }catch(error){if(error.status)throw error;throw youtubeError('provider_network');}finally{clearTimeout(timer);}
}
function duration(value){const m=typeof value==='string'&&value.match(/^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/);if(!m)throw youtubeError('invalid_response');return Number(m[1]||0)*86400+Number(m[2]||0)*3600+Number(m[3]||0)*60+Number(m[4]||0);}
export async function fetchYouTubeVideos(env,ids,options={}){
 if(!Array.isArray(ids)||!ids.length||ids.length>50||!ids.every(youtubeId))throw youtubeError('invalid_input',400);
 const data=await youtubeRequest(env,'videos',{part:'snippet,contentDetails,status',id:[...new Set(ids)].join(',')},options),videos=[],seen=new Set();
 for(const item of data.items){
  if(!youtubeId(item.id)||!ids.includes(item.id)||seen.has(item.id))throw youtubeError('invalid_response');seen.add(item.id);
  if(item.status?.privacyStatus!=='public'||!['processed','uploaded'].includes(item.status?.uploadStatus))continue;
  const s=item.snippet;if(!s||typeof s.title!=='string'||typeof s.channelTitle!=='string'||typeof s.channelId!=='string'||!Number.isFinite(Date.parse(s.publishedAt)))throw youtubeError('invalid_response');
  let thumbnailUrl=null;for(const key of ['high','medium','default']){try{const u=new URL(s.thumbnails?.[key]?.url);if(u.protocol==='https:'&&['i.ytimg.com','i9.ytimg.com'].includes(u.hostname)&&!u.username&&!u.password&&!u.port){thumbnailUrl=u.href;break;}}catch{}}
  videos.push({videoId:item.id,title:s.title.slice(0,1000),channelId:s.channelId,channelTitle:s.channelTitle.slice(0,500),publishedAt:new Date(s.publishedAt).toISOString(),thumbnailUrl,durationSeconds:duration(item.contentDetails?.duration),canonicalUrl:`https://www.youtube.com/watch?v=${item.id}`});
 }
 return {videos,unavailableIds:ids.filter(id=>!videos.some(v=>v.videoId===id))};
}
