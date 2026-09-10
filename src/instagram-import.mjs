const invalid=()=>{throw Object.assign(new Error('invalid_import'),{status:400});};
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

export async function importInstagram(DB,input,{before=[],after=[]}={}){
    if(!Array.isArray(input)||!input.length||input.length>100)invalid();const rawByCode=new Map(input.map(p=>[p?.shortCode??p?.code,p]));const posts=[...rawByCode.values()].map(normalize);
    const now=new Date().toISOString(),snapshots=new Map();
    for(const p of posts){
      const existing=await DB.prepare('SELECT data FROM instagram_review WHERE code=?').bind(p.code).first();
      snapshots.set(p.code,existing?.data??null);
      if(!existing)continue;
      const old=JSON.parse(existing.data),raw=rawByCode.get(p.code);
      if(raw.timestamp==null&&raw.publishedAt==null)p.publishedAt=old.publishedAt;
      if(raw.ownerUsername==null&&raw.author==null)p.author=old.author;
      if(raw.caption==null)p.caption=old.caption;
      if(!raw.productType&&old.url?.includes('/reel/'))p.url=old.url;
      if((p.media.some(m=>m.kind==='unknown')&&old.media?.some(m=>m.kind!=='unknown'))||old.images?.length>p.images.length){p.images=old.images;p.image=old.image;p.mediaCount=Math.max(p.mediaCount,old.mediaCount);}
      p.media=p.images.map(previewUrl=>{const incoming=p.media.find(m=>m.previewUrl===previewUrl),previous=old.media?.find(m=>m.previewUrl===previewUrl);return incoming?.kind!=='unknown'&&incoming?incoming:previous??incoming??{previewUrl,kind:'unknown'};});
    }
    // Re-import enriches metadata but never resets a manual decision or its revision.
    const guards=posts.map(p=>({p,token:crypto.randomUUID(),snapshot:snapshots.get(p.code)}));
    try{await DB.batch([
      ...before,
      ...guards.map(({p,token,snapshot})=>DB.prepare('INSERT INTO commit_guard(token,ok) SELECT ?,CASE WHEN (SELECT data FROM instagram_review WHERE code=?) IS ? THEN 1 ELSE 0 END').bind(token,p.code,snapshot)),
      ...posts.map(p=>DB.prepare('INSERT INTO instagram_review(code,data,imported_at) VALUES(?,?,?) ON CONFLICT(code) DO UPDATE SET data=excluded.data').bind(p.code,JSON.stringify(p),now)),
      ...guards.map(({token})=>DB.prepare('DELETE FROM commit_guard WHERE token=?').bind(token)),...after
    ]);}catch(error){if(/CHECK constraint failed/i.test(String(error)))throw Object.assign(new Error('review_conflict'),{status:409});throw error;}
return {imported:posts.length};
}
