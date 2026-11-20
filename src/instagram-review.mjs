import {requireActor,auditFailure} from './review-audit.mjs';
import {decideInstagram} from './review-mutations.mjs';
import {normalize,importInstagram} from './instagram-import.mjs';
import {instagramPreviewUrls} from './instagram-preview-urls.mjs';
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
// Maintenance's X comparison for each stored photo of the page (videos are never compared). A match names the X photo and
// whether the feed shows it: only then is the Instagram copy hidden once kept.
async function xComparison(DB,rows){
  const photos=rows.flatMap(r=>{const d=JSON.parse(r.data),images=d.images?.length?d.images:(d.image?[d.image]:[]);
    return images.map((url,position)=>({code:r.code,position,url,video:d.media?.[position]?.kind==='video'}));});
  const urls=photos.filter(p=>!p.video).map(p=>p.url);
  const {results}=urls.length?await DB.prepare("SELECT url,dhash IS NOT NULL AS compared,error,confirmed_hash,CASE WHEN json_extract(candidate_metadata_json,'$.origin')='instagram_auto_match' AND confirmed_hash IS NOT NULL THEN json_extract(candidate_metadata_json,'$.rightImageUrl') END AS x_image,json_extract(candidate_metadata_json,'$.distance') AS distance FROM x_fingerprints WHERE url IN (SELECT value FROM json_each(?))").bind(JSON.stringify(urls)).all():{results:[]};
  const rowsByUrl=new Map(results.map(r=>[r.url,r])),matched=results.filter(r=>r.x_image);
  const posts=new Map(),shown=new Set();
  if(matched.length){
    const [x,feed]=await DB.batch([
      DB.prepare('SELECT m.url,p.author,p.published_at,p.canonical_url FROM x_review_media m JOIN x_review_posts p ON p.id=m.post_id WHERE m.url IN (SELECT value FROM json_each(?))').bind(JSON.stringify(matched.map(r=>r.x_image))),
      DB.prepare('SELECT DISTINCT hash FROM x_photo_rows WHERE rank=1 AND hash IN (SELECT value FROM json_each(?))').bind(JSON.stringify(matched.map(r=>r.confirmed_hash)))]);
    for(const r of x.results)if(!posts.has(r.url))posts.set(r.url,r);
    for(const r of feed.results)shown.add(r.hash);
  }
  const byCode=new Map(rows.map(r=>[r.code,{photos:0,compared:0,waiting:0,failed:0,matches:[]}]));
  for(const p of photos){
    if(p.video)continue;const c=byCode.get(p.code),f=rowsByUrl.get(p.url);c.photos++;
    if(f?.x_image){const post=posts.get(f.x_image);c.compared++;c.matches.push({position:p.position,image:f.x_image,url:post?.canonical_url??null,author:post?.author??null,publishedAt:post?.published_at??null,distance:f.distance,shown:shown.has(f.confirmed_hash)});}
    else if(f?.compared)c.compared++;
    else if(f?.error==='perceptual_failed')c.failed++;
    else c.waiting++;
  }
  return byCode;
}
export async function handleInstagramReview(request,env,context) {
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
    const comparison=await xComparison(env.DB,results);
    const items=await instagramPreviewUrls(env.DB,results.map(r=>({...JSON.parse(r.data),status:r.status,revision:r.revision,importedAt:r.imported_at,reviewedAt:r.reviewed_at,xComparison:comparison.get(r.code)})),{review:true});
    return reply({items,counts:Object.fromEntries(counts.results.map(r=>[r.status,r.count])),authors:authors.results.map(r=>r.author)});
  }
  if(request.method!=='POST')return reply({error:'method_not_allowed'},405);
  if(request.headers.get('origin')!==url.origin||request.headers.get('x-review-action')!=='review')return reply({error:'invalid_origin'},403);
  let input;try{input=await body(request);}catch{return reply({error:'invalid_import'},400);}
  if(path==='/import') {
    try{return reply(await importInstagram(env.DB,input));}catch(error){if(error.status)return reply({error:error.message},error.status);throw error;}

  }
  const match=path.match(/^\/([A-Za-z0-9_-]{5,64})$/);
  if(!match)return reply({error:'not_found'},404);
  try{return reply(await decideInstagram(env.DB,match[1],input,requireActor(context)));}
  catch(error){return auditFailure(error);}
}
