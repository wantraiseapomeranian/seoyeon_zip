import {normalize as normalizeInstagram} from './instagram-import.mjs';
const fail=code=>{throw new Error(code);};
export function manualUrl(value){
 const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port)fail('invalid_url');let m;
 if(['x.com','www.x.com','twitter.com','www.twitter.com'].includes(u.hostname)&&(m=u.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/status\/(\d{1,30})\/?$/)))return {id:'manual:x:'+m[2],platform:'x',platformPostId:m[2],authorHandle:m[1],canonicalUrl:`https://x.com/${m[1]}/status/${m[2]}`};
 if(['instagram.com','www.instagram.com'].includes(u.hostname)&&(m=u.pathname.match(/^\/(p|reel)\/([A-Za-z0-9_-]{5,64})\/?$/)))return {id:'manual:ig:'+m[2],platform:'instagram',platformPostId:m[2],authorHandle:'',canonicalUrl:`https://www.instagram.com/${m[1]}/${m[2]}/`};
 fail('invalid_url');
}
export async function providerJson(url,{fetcher=fetch,token,body}={}){
 let response;try{response=await fetcher(url,{method:body?'POST':'GET',headers:{'User-Agent':'SeoyeonZip/0.1',...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'manual',signal:AbortSignal.timeout(8000)});}catch{fail('provider_network');}
 if(!response.ok){await response.body?.cancel();fail(response.status===429?'rate_limited':response.status===404?'not_found':response.status===401||response.status===403?'provider_access':'provider_failure');}
 const reader=response.body?.getReader();if(!reader)fail('invalid_response');const chunks=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2_000_000){await reader.cancel();fail('response_too_large');}chunks.push(value);}}catch(error){if(error.message==='response_too_large')throw error;fail('provider_network');}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 try{return JSON.parse(new TextDecoder().decode(bytes));}catch{fail('invalid_response');}
}
export async function fetchManualX(post,fetcher){
 const json=await providerJson(`https://api.fxtwitter.com/status/${post.platformPostId}`,{fetcher});
 if(json.code!==200)fail(json.code===404?'not_found':json.code===401?'unavailable':'provider_failure');
 const p=json.tweet;if(!p||p.id!==post.platformPostId||!/^[A-Za-z0-9_]{1,15}$/.test(p.author?.screen_name??'')||typeof p.text!=='string'||p.text.length>20000||!Number.isFinite(Date.parse(p.created_at)))fail('invalid_response');
 const raw=p.media?.all??[...(p.media?.photos??[]),...(p.media?.videos??[])];if(!Array.isArray(raw)||raw.length>100)fail('invalid_response');
 const media=raw.map((m,position)=>{
  if(!['photo','video','gif'].includes(m.type))fail('invalid_response');
  const value=m.type==='photo'?m.url:m.thumbnail_url;let previewUrl=null;
  if(value!=null){let u;try{u=new URL(value);}catch{fail('invalid_response');}if(u.protocol!=='https:'||u.hostname!=='pbs.twimg.com'||u.username||u.password||u.port)fail('invalid_response');previewUrl=u.href;}
  return {position,kind:m.type==='photo'?'image':m.type,previewUrl,width:Number.isSafeInteger(m.width)&&m.width>0?m.width:null,height:Number.isSafeInteger(m.height)&&m.height>0?m.height:null};
 });
 return {...post,authorHandle:p.author.screen_name,canonicalUrl:`https://x.com/${p.author.screen_name}/status/${p.id}`,publishedAt:new Date(p.created_at).toISOString(),dateEstimated:false,caption:p.text,media};
}
export function manualInstagram(post,rows){
 if(!Array.isArray(rows)||rows.length!==1||rows[0]?.shortCode!==post.platformPostId)fail('invalid_response');
 let p;try{p=normalizeInstagram(rows[0]);}catch{fail('invalid_response');}
 return {...post,authorHandle:p.author,caption:p.caption,...(p.publishedAt?{publishedAt:p.publishedAt,dateEstimated:false}:{}),media:p.media.map((m,position)=>({...m,position,width:null,height:null}))};
}
