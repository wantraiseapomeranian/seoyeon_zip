const statuses=['pending','kept','excluded','held'];
const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
const invalid=()=>{throw new Error('invalid');};
function normalize(p) {
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
  const text=caption.normalize('NFKC').toLowerCase();
  const reasons=[];
  if(/twitter|트위터|source\s*:\s*x/.test(text))reasons.push('X 출처 표기 · 사진 중복은 미확인');
  if(/tuide|튜이드|roleplay|role-play/.test(text))reasons.push('동명이인 또는 역할극 문맥');
  if(!/triples|트리플\s*에스|트리플s/.test(text)||!/윤서연|seoyeon|서연/.test(text))reasons.push('그룹·인물 문맥 추가 확인 필요');
  if(['jeonghyerin','leejiwoo','kimchaeyeon','kimyooyeon','kimsumin'].filter(n=>text.includes(n)).length>=3)reasons.push('여러 멤버 이름이 반복된 게시물');
  if(!reasons.length)reasons.push('그룹·인물 문맥 일치 · 사진은 직접 확인');
  return {code,url:`https://www.instagram.com/p/${code}/`,caption,author,publishedAt:date?new Date(date).toISOString():null,image:images[0]??null,images,reasons,
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
    const where=status==='all'?'':' WHERE status=?';
    const {results}=await env.DB.prepare(`SELECT * FROM instagram_review${where} ORDER BY imported_at DESC,code LIMIT 25 OFFSET ?`).bind(...(status==='all'?[]:[status]),offset).all();
    const counts=await env.DB.prepare('SELECT status,COUNT(*) AS count FROM instagram_review GROUP BY status').all();
    return reply({items:results.map(r=>({...JSON.parse(r.data),status:r.status,revision:r.revision,importedAt:r.imported_at,reviewedAt:r.reviewed_at})),counts:Object.fromEntries(counts.results.map(r=>[r.status,r.count]))});
  }
  if(request.method!=='POST')return reply({error:'method_not_allowed'},405);
  if(request.headers.get('origin')!==url.origin||request.headers.get('x-review-action')!=='review')return reply({error:'invalid_origin'},403);
  let input;try{input=await body(request);}catch{return reply({error:'invalid_import'},400);}
  if(path==='/import') {
    let posts;try{if(!Array.isArray(input)||!input.length||input.length>100)invalid();posts=[...new Map(input.map(p=>{const item=normalize(p);return[item.code,item];})).values()];}catch{return reply({error:'invalid_import'},400);}
    const now=new Date().toISOString();
    // Re-import enriches metadata but never resets a manual decision or its revision.
    await env.DB.batch(posts.map(p=>env.DB.prepare("INSERT INTO instagram_review(code,data,imported_at) VALUES(?,?,?) ON CONFLICT(code) DO UPDATE SET data=CASE WHEN COALESCE(json_array_length(excluded.data,'$.images'),0)<COALESCE(json_array_length(instagram_review.data,'$.images'),0) THEN json_set(excluded.data,'$.images',json_extract(instagram_review.data,'$.images'),'$.mediaCount',MAX(COALESCE(json_extract(instagram_review.data,'$.mediaCount'),1),json_array_length(instagram_review.data,'$.images'))) ELSE excluded.data END").bind(p.code,JSON.stringify(p),now)));
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
