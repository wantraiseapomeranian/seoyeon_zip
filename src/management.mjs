import {registerManual,listManual,processManual} from './manual-posts.mjs';
import {sources} from './sources.mjs';
const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
async function input(request){const reader=request.body?.getReader();if(!reader)throw Error('body');let size=0;const chunks=[];while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>8192){await reader.cancel();throw Error('size');}chunks.push(value);}const bytes=new Uint8Array(size);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length;}return JSON.parse(new TextDecoder().decode(bytes));}
const pick=(obj,fields)=>Object.fromEntries(fields.filter(k=>obj[k]!==undefined).map(k=>[k,obj[k]]));
function postMetadata(p){return {...pick(p,['id','platform','platformPostId','canonicalUrl','authorHandle','publishedAt','caption','contentKind','observedViaSource','dateEstimated','manual']),media:(p.media||[]).map(m=>pick(m,['position','kind','previewUrl','width','height']))};}
export async function handleManagement(request,env,ctx){const {pathname}=new URL(request.url),DB=env.DB;
 if(pathname==='/api/manual-posts'&&request.method==='GET'){const {status,...data}=await listManual(env,new URL(request.url).searchParams);return reply(data,status);}
 if(pathname==='/api/export'){
  if(request.method!=='GET')return reply({error:'method_not_allowed'},405);
  const posts=await DB.prepare('SELECT p.data,q.decision,q.availability FROM posts p LEFT JOIN x_quality q ON q.post_id=p.id ORDER BY p.id').all();
  const ig=await DB.prepare('SELECT data,status FROM instagram_review ORDER BY code').all();const manual=await DB.prepare('SELECT data FROM manual_posts ORDER BY id').all();
  const data={schemaVersion:1,exportedAt:new Date().toISOString(),posts:posts.results.map(r=>({...postMetadata(JSON.parse(r.data)),review:{decision:r.decision??'auto',availability:r.availability??'unknown'}})),instagram:ig.results.map(r=>({...pick(JSON.parse(r.data),['code','url','caption','author','publishedAt','image','images','mediaCount']),status:r.status})),manual:manual.results.map(r=>postMetadata(JSON.parse(r.data)))};
  return Response.json(data,{headers:{'Cache-Control':'private, no-store','Content-Disposition':'attachment; filename="seoyeon-metadata.json"','X-Content-Type-Options':'nosniff'}});
 }
 if(request.headers.get('origin')!==new URL(request.url).origin||request.headers.get('x-management-action')!=='manage')return reply({error:'invalid_origin'},403);
 if(!request.headers.get('content-type')?.startsWith('application/json'))return reply({error:'invalid_input'},400);
 let body;try{body=await input(request);}catch{return reply({error:'invalid_input'},400);}if(!body||typeof body!=='object')return reply({error:'invalid_input'},400);
 if(pathname==='/api/manual-posts'){
  if(request.method!=='POST')return reply({error:'method_not_allowed'},405);
  const {status,...data}=await registerManual(env,body);
  if(data.id&&data.state==='pending'&&env.MANUAL_MEDIA_ENABLED==='true'&&ctx)ctx.waitUntil(processManual(env,{id:data.id}).catch(()=>{}));
  return reply(data,status);
 }
 if(request.method!=='PATCH')return reply({error:'method_not_allowed'},405);
 const source=pathname.slice('/api/sources/'.length);if(!sources.some(s=>s.handle===source))return reply({error:'unknown_source'},404);
 if(typeof body.enabled!=='boolean'||!Number.isSafeInteger(body.revision)||body.revision<0)return reply({error:'invalid_input'},400);
 if(body.enabled&&env.COLLECTION_ENABLED!=='true')return reply({error:'collection_disabled'},409);
 const result=await DB.prepare("UPDATE collection_state SET enabled=?,revision=revision+1,lease_token=NULL,lease_until=NULL WHERE source=? AND revision=? AND (?=0 OR EXISTS(SELECT 1 FROM collection_control WHERE id=1 AND enabled=1))").bind(Number(body.enabled),source,body.revision,Number(body.enabled)).run();
 return result.meta.changes===1?reply({saved:true}):reply({error:'source_conflict_or_disabled'},409);
}
