import {readXReview} from './x-review-query.mjs';
import {requireActor,auditFailure} from './review-audit.mjs';
import {decideXPost,decidePhotos} from './review-mutations.mjs';
const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
export async function handleXReview(request,env,context){
 const url=new URL(request.url),DB=env.DB;
 if(request.method==='GET'){
  try{return reply(await readXReview(DB,url.searchParams));}
  catch(error){if(error.message==='invalid_query')return reply({error:'invalid_query'},400);throw error;}
 }
 if(request.method!=='POST')return reply({error:'method_not_allowed'},405);
 if(request.headers.get('origin')!==url.origin||request.headers.get('x-review-action')!=='review')return reply({error:'invalid_origin'},403);
 if(!request.headers.get('content-type')?.startsWith('application/json'))return reply({error:'invalid_input'},400);
 const reader=request.body?.getReader();if(!reader)return reply({error:'invalid_input'},400);
 let text='',size=0;const decoder=new TextDecoder();while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>16384){await reader.cancel();return reply({error:'invalid_input'},400);}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();
 let value;try{value=JSON.parse(text);}catch{return reply({error:'invalid_input'},400);}
 try {
  const actor=requireActor(context);
  return reply(await (['merge','unmerge','different'].includes(value?.action)?decidePhotos(DB,value,actor):decideXPost(DB,value,actor)));
 }catch(error){return auditFailure(error);}
}
