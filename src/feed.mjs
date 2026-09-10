const dateSql="json_extract(p.data,'$.publishedAt')";
export async function readFeed(db, params) {
  const sort=params.get('sort')||'newest', media=params.get('media')||'all';
  const kind=params.get('kind')||'all', source=params.get('source')||'all', month=params.get('month')||'';
  const invalid=()=>{throw Object.assign(new Error('invalid_feed_query'),{status:400});};
  if(!['newest','oldest'].includes(sort)||!['all','image','video'].includes(media)||!['all','cosmo','fansite','official','other'].includes(kind))invalid();
  if(source!=='all'&&!/^[A-Za-z0-9_]{1,15}$/.test(source))invalid();
  if(month&&!/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(month))invalid();
  const where=[],args=[];
  if(kind!=='all'){where.push("json_extract(p.data,'$.contentKind')=?");args.push(kind);}
  if(source==='instagram'){where.push("json_extract(p.data,'$.platform')='instagram'");}else if(source!=='all'){where.push('EXISTS (SELECT 1 FROM discoveries d WHERE d.post_id=p.id AND d.source=?)');args.push(source);}
  if(media!=='all')where.push(`EXISTS (SELECT 1 FROM json_each(p.data,'$.media') m WHERE json_extract(m.value,'$.kind') ${media==='image'?"= 'image'":"IN ('video','gif')"})`);
  if(month){
    const start=new Date(`${month}-01T00:00:00+09:00`);
    const [year,number]=month.split('-').map(Number);
    const next=new Date(Date.UTC(year,number,1)-9*60*60*1000);
    where.push(`${dateSql}>=? AND ${dateSql}<?`);args.push(start.toISOString(),next.toISOString());
  }
  const condition=()=>where.length?' WHERE '+where.join(' AND '):'';
  const total=await db.prepare('SELECT COUNT(*) AS count FROM feed_posts p'+condition()).bind(...args).first();
  const scope=JSON.stringify([sort,media,kind,source,month]);
  if(params.has('cursor')){
    if(params.get('cursor').length>2048)invalid();
    let cursor;try{cursor=JSON.parse(atob(params.get('cursor')));}catch{invalid();}
    if(!cursor||cursor.scope!==scope||typeof cursor.id!=='string'||!/^(?:(?:x:)?\d{1,30}|ig:[A-Za-z0-9_-]{5,64})$/.test(cursor.id)||typeof cursor.date!=='string'||!Number.isFinite(Date.parse(cursor.date)))invalid();
    where.push(`(${dateSql}${sort==='oldest'?'>':'<'}? OR (${dateSql}=? AND p.id>?))`);args.push(cursor.date,cursor.date,cursor.id);
  }
  const {results}=await db.prepare(`SELECT p.id,p.data FROM feed_posts p${condition()} ORDER BY ${dateSql} ${sort==='oldest'?'ASC':'DESC'},p.id ASC LIMIT 49`).bind(...args).all();
  const page=results.slice(0,48), posts=page.map(r=>JSON.parse(r.data));
  if(posts.length){
    const related=await db.prepare("SELECT DISTINCT a.id,json_extract(p.data,'$.canonicalUrl') AS url,json_extract(p.data,'$.authorHandle') AS author FROM x_photo_rows a JOIN x_photo_rows b ON a.hash=b.hash AND a.id!=b.id JOIN posts p ON p.id=b.id WHERE a.rank=1 AND a.id IN (SELECT value FROM json_each(?))").bind(JSON.stringify(page.map(r=>r.id))).all();
    const instagramRelated=await db.prepare("SELECT DISTINCT x.id,json_extract(i.data,'$.url') AS url,json_extract(i.data,'$.author') AS author FROM x_photo_rows x JOIN instagram_photo_rows i ON i.hash=x.hash WHERE x.rank=1 AND x.id IN (SELECT value FROM json_each(?))").bind(JSON.stringify(page.map(r=>r.id))).all();
    related.results.push(...instagramRelated.results);
    for(const post of posts)post.duplicateSources=related.results.filter(r=>r.id===post.id).map(r=>({url:r.url,author:r.author}));
  }
  const last=posts.at(-1);
  const state=await db.prepare('SELECT MAX(last_success_at) AS latest FROM collection_state').first();
  return {posts,total:total.count,collectedAt:state?.latest==null?null:new Date(state.latest*1000).toISOString(),nextCursor:results.length>48?btoa(JSON.stringify({scope,id:page.at(-1).id,date:last.publishedAt})):null};
}
