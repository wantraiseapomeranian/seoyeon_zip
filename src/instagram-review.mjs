import {normalize,importInstagram} from './instagram-import.mjs';
export {normalize};
import {reviewFilters} from './review-filters.mjs';
const statuses=['pending','kept','excluded','held'];
const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
const invalid=()=>{throw new Error('invalid');};
async function body(request) {
  if(!request.headers.get('content-type')?.startsWith('application/json'))invalid();
  const reader=request.body?.getReader();if(!reader)invalid();
  let size=0;const chunks=[];
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2_000_000){await reader.cancel();invalid();}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
  return JSON.parse(new TextDecoder().decode(bytes));
}
export async function handleInstagramReview(request,env) {
  const url=new URL(request.url),path=url.pathname.slice('/api/admin/instagram'.length);
  if(request.method==='GET'&&path==='') {
    const status=url.searchParams.get('status')??'pending';
    const offset=Number(url.searchParams.get('offset')??0);
    if(![...statuses,'all'].includes(status)||!Number.isSafeInteger(offset)||offset<0||offset>100000)return reply({error:'invalid_query'},400);
    let filters;try{filters=reviewFilters(url.searchParams,{instagram:true});}catch{return reply({error:'invalid_query'},400);}
    const conditions=[],args=[],params=url.searchParams;
    if(params.get('month')){conditions.push("strftime('%Y-%m',json_extract(data,'$.publishedAt'),'+9 hours')=?");args.push(params.get('month'));}
    if(params.get('author')){conditions.push("lower(json_extract(data,'$.author'))=lower(?)");args.push(params.get('author'));}
    if(params.get('media')&&params.get('media')!=='all'){
      conditions.push("EXISTS(SELECT 1 FROM json_each(CASE WHEN COALESCE(json_array_length(data,'$.media'),0)>0 THEN json_extract(data,'$.media') ELSE '[{\"kind\":\"unknown\"}]' END) m WHERE json_extract(m.value,'$.kind')=?)");args.push(params.get('media'));
    }
    const where=conditions.length?' WHERE '+conditions.join(' AND '):'';
    const counts=await env.DB.prepare('SELECT status,COUNT(*) AS count FROM instagram_review'+where+' GROUP BY status').bind(...args).all();
    const {results}=await env.DB.prepare('SELECT * FROM instagram_review'+where+(status==='all'?'':(where?' AND':' WHERE')+' status=?')+' ORDER BY imported_at DESC,code LIMIT 25 OFFSET ?').bind(...args,...(status==='all'?[]:[status]),offset).all();
    const authors=await env.DB.prepare("SELECT DISTINCT json_extract(data,'$.author') AS author FROM instagram_review WHERE COALESCE(json_extract(data,'$.author'),'')!='' ORDER BY author").all();
    return reply({items:results.map(r=>({...JSON.parse(r.data),status:r.status,revision:r.revision,importedAt:r.imported_at,reviewedAt:r.reviewed_at})),counts:Object.fromEntries(counts.results.map(r=>[r.status,r.count])),authors:authors.results.map(r=>r.author)});
  }
  if(request.method!=='POST')return reply({error:'method_not_allowed'},405);
  if(request.headers.get('origin')!==url.origin||request.headers.get('x-review-action')!=='review')return reply({error:'invalid_origin'},403);
  let input;try{input=await body(request);}catch{return reply({error:'invalid_import'},400);}
  if(path==='/import') {
    try{return reply(await importInstagram(env.DB,input));}catch(error){if(error.status)return reply({error:error.message},error.status);throw error;}

  }
  const match=path.match(/^\/([A-Za-z0-9_-]{5,64})$/);
  if(!match)return reply({error:'not_found'},404);
  if(!input||!statuses.includes(input.status)||!Number.isSafeInteger(input.revision)||input.revision<0)return reply({error:'invalid_decision'},400);
  const result=await env.DB.prepare('UPDATE instagram_review SET status=?,revision=revision+1,reviewed_at=? WHERE code=? AND revision=?').bind(input.status,new Date().toISOString(),match[1],input.revision).run();
  if(result.meta.changes===1)return reply({saved:true});
  const exists=await env.DB.prepare('SELECT code FROM instagram_review WHERE code=?').bind(match[1]).first();
  return reply({error:exists?'review_conflict':'not_found'},exists?409:404);
}
