import {reviewFilters} from './review-filters.mjs';
const statuses=['pending','kept','excluded','held'];
const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
const invalid=()=>{throw new Error('invalid');};
export function normalize(p) {
  if(!p || typeof p!=='object')invalid();
  const code=p.shortCode??p.code;
  if(typeof code!=='string'|| !/^[A-Za-z0-9_-]{5,64}$/.test(code))invalid();
  const caption=p.caption??'';
  if(typeof caption!=='string'||caption.length>20000)invalid();
  const author=p.ownerUsername??p.author??'';
  if(typeof author!=='string'||author.length>100)invalid();
  const date=p.timestamp??p.publishedAt;
  if(date!=null && (typeof date!=='string'||!Number.isFinite(Date.parse(date))))invalid();
  const safeImage=value=>{try{const u=new URL(value);if(u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&/(^|\.)(cdninstagram\.com|fbcdn\.net)$/.test(u.hostname))return u.href;}catch{}return null;};
  const image=safeImage(p.displayUrl??p.thumbnailUrl);
  const children=Array.isArray(p.childPosts)?p.childPosts.slice(0,100).map(c=>c?.displayUrl??c?.thumbnailUrl):[];
  const supplied=Array.isArray(p.images)?p.images.slice(0,100):[];
  const images=[...new Set((children.length?children:[image,...supplied]).map(safeImage).filter(Boolean))];
  if(!images.length&&image)images.push(image);
  const kindOf=c=>c.type==='Video'||c.isVideo===true||c.productType==='clips'?'video':c.type==='Image'||c.isVideo===false?'image':'unknown';
  const media=images.map(previewUrl=>({previewUrl,kind:kindOf(p.childPosts?.find(c=>safeImage(c.displayUrl??c.thumbnailUrl)===previewUrl)??(p.type==='Sidecar'?{}:p))}));
  const text=caption.normalize('NFKC').toLowerCase();
  const reasons=[];
  if(/twitter|트위터|source\s*:\s*x/.test(text))reasons.push('X 출처 표기 · 사진 중복은 미확인');
  if(/tuide|튜이드|roleplay|role-play/.test(text))reasons.push('동명이인 또는 역할극 문맥');
  if(!/triples|트리플\s*에스|트리플s/.test(text)||!/윤서연|seoyeon|서연/.test(text))reasons.push('그룹·인물 문맥 추가 확인 필요');
  if(['jeonghyerin','leejiwoo','kimchaeyeon','kimyooyeon','kimsumin'].filter(n=>text.includes(n)).length>=3)reasons.push('여러 멤버 이름이 반복된 게시물');
  if(!reasons.length)reasons.push('그룹·인물 문맥 일치 · 사진은 직접 확인');
  return {code,url:`https://www.instagram.com/${p.productType==='clips'?'reel':'p'}/${code}/`,caption,author,publishedAt:date?new Date(date).toISOString():null,image:images[0]??null,images,media,reasons,
    firstSeenInTrial:typeof p.firstSeenInTrial==='boolean'?p.firstSeenInTrial:null,
    newlyPublished:typeof p.newlyPublished==='boolean'?p.newlyPublished:null,
    mediaCount:Number.isSafeInteger(p.mediaCount??p.childPosts?.length)?Math.max(1,Math.min(100,p.mediaCount??p.childPosts.length)):1};
}
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
    let posts;try{if(!Array.isArray(input)||!input.length||input.length>100)invalid();posts=[...new Map(input.map(p=>{const item=normalize(p);return[item.code,item];})).values()];}catch{return reply({error:'invalid_import'},400);}
    const now=new Date().toISOString(),snapshots=new Map();
    for(const p of posts){
      const existing=await env.DB.prepare('SELECT data FROM instagram_review WHERE code=?').bind(p.code).first();
      snapshots.set(p.code,existing?.data??null);
      if(!existing)continue;
      const old=JSON.parse(existing.data),raw=input.find(r=>(r.shortCode??r.code)===p.code);
      if(raw.timestamp==null&&raw.publishedAt==null)p.publishedAt=old.publishedAt;
      if(raw.ownerUsername==null&&raw.author==null)p.author=old.author;
      if(raw.caption==null)p.caption=old.caption;
      if(!raw.productType&&old.url?.includes('/reel/'))p.url=old.url;
      if((p.media.some(m=>m.kind==='unknown')&&old.media?.some(m=>m.kind!=='unknown'))||old.images?.length>p.images.length){p.images=old.images;p.image=old.image;p.mediaCount=Math.max(p.mediaCount,old.mediaCount);}
      p.media=p.images.map(previewUrl=>{const incoming=p.media.find(m=>m.previewUrl===previewUrl),previous=old.media?.find(m=>m.previewUrl===previewUrl);return incoming?.kind!=='unknown'&&incoming?incoming:previous??incoming??{previewUrl,kind:'unknown'};});
    }
    // Re-import enriches metadata but never resets a manual decision or its revision.
    const guards=posts.map(p=>({p,token:crypto.randomUUID(),snapshot:snapshots.get(p.code)}));
    try{await env.DB.batch([
      ...guards.map(({p,token,snapshot})=>env.DB.prepare('INSERT INTO commit_guard(token,ok) SELECT ?,CASE WHEN (SELECT data FROM instagram_review WHERE code=?) IS ? THEN 1 ELSE 0 END').bind(token,p.code,snapshot)),
      ...posts.map(p=>env.DB.prepare('INSERT INTO instagram_review(code,data,imported_at) VALUES(?,?,?) ON CONFLICT(code) DO UPDATE SET data=excluded.data').bind(p.code,JSON.stringify(p),now)),
      ...guards.map(({token})=>env.DB.prepare('DELETE FROM commit_guard WHERE token=?').bind(token))
    ]);}catch(error){if(/CHECK constraint failed/i.test(String(error)))return reply({error:'review_conflict'},409);throw error;}
    return reply({imported:posts.length});
  }
  const match=path.match(/^\/([A-Za-z0-9_-]{5,64})$/);
  if(!match)return reply({error:'not_found'},404);
  if(!input||!statuses.includes(input.status)||!Number.isSafeInteger(input.revision)||input.revision<0)return reply({error:'invalid_decision'},400);
  const result=await env.DB.prepare('UPDATE instagram_review SET status=?,revision=revision+1,reviewed_at=? WHERE code=? AND revision=?').bind(input.status,new Date().toISOString(),match[1],input.revision).run();
  if(result.meta.changes===1)return reply({saved:true});
  const exists=await env.DB.prepare('SELECT code FROM instagram_review WHERE code=?').bind(match[1]).first();
  return reply({error:exists?'review_conflict':'not_found'},exists?409:404);
}
