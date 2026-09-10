import {readFileSync,writeFileSync} from 'node:fs';
import {fingerprint,hamming,checkOriginal} from '../src/x-maintenance.mjs';
import {reviewReason} from '../src/x-policy.mjs';
const bytes=readFileSync('.local/x-quality-posts.json');const raw=bytes[0]===255?bytes.toString('utf16le'):bytes.toString('utf8');
const posts=JSON.parse(raw.replace(/^\uFEFF/,''))[0].results.map(r=>JSON.parse(r.data));
const quote=s=>s==null?'NULL':"'"+String(s).replaceAll("'","''")+"'";
const urls=[...new Set(posts.flatMap(p=>p.media.filter(m=>m.kind==='image'&&m.previewUrl?.startsWith('https://pbs.twimg.com/media/')).map(m=>m.previewUrl)))];
let fingerprints={};try{fingerprints=JSON.parse(readFileSync('.local/x-fingerprints.json','utf8'));}catch{}
let index=0;
await Promise.all(Array.from({length:4},async()=>{while(index<urls.length){const url=urls[index++];if(fingerprints[url]?.version===2)continue;try{fingerprints[url]=await fingerprint(url);}catch(e){fingerprints[url]={error:e.message};}writeFileSync('.local/x-fingerprints.json',JSON.stringify(fingerprints));}}));
const entries=Object.entries(fingerprints);const sql=[];
for(const p of posts)sql.push(`UPDATE posts SET data=json_set(data,'$.moderationReason',${quote(reviewReason(p.caption))}) WHERE id=${quote(p.id)};`);
for(const [url,f] of entries){if(!f.hash)continue;const near=entries.find(([other,g])=>other!==url&&g.hash&&g.hash!==f.hash&&Math.abs(g.width/g.height-f.width/f.height)<.02&&hamming(g.dhash,f.dhash)<=4);
 sql.push(`INSERT INTO x_fingerprints(url,hash,dhash,width,height,near_url) VALUES(${[url,f.hash,f.dhash,f.width,f.height,near?.[0]].map(quote).join(',')}) ON CONFLICT(url) DO UPDATE SET hash=excluded.hash,dhash=excluded.dhash,width=excluded.width,height=excluded.height,near_url=excluded.near_url;`);
}
const missing=posts.find(p=>p.platformPostId==='2097716671142371532');
if(missing&&await checkOriginal(missing)==='missing')sql.push(`INSERT INTO x_quality(post_id,availability,missing_count,checked_at,next_check) VALUES(${quote(missing.id)},'missing',1,unixepoch(),unixepoch()+21600) ON CONFLICT(post_id) DO UPDATE SET availability='missing',missing_count=x_quality.missing_count+1,checked_at=unixepoch(),next_check=unixepoch()+21600;`);
writeFileSync('.local/x-quality-backfill.sql',sql.join('\n'));
const groups=new Map();for(const p of posts)for(const m of p.media){const f=fingerprints[m.previewUrl];if(!f?.hash)continue;const g=groups.get(f.hash)||[];g.push({post:p.id,url:p.canonicalUrl,image:m.previewUrl});groups.set(f.hash,g);}
writeFileSync('.local/x-duplicate-groups.json',JSON.stringify([...groups.values()].filter(g=>new Set(g.map(p=>p.post)).size>1),null,2));
console.log(JSON.stringify({posts:posts.length,images:urls.length,hashed:entries.filter(([,f])=>f.hash).length,errors:entries.filter(([,f])=>!f.hash).length,review:posts.filter(p=>reviewReason(p.caption)).length,duplicateGroups:[...groups.values()].filter(g=>new Set(g.map(p=>p.post)).size>1).length}));
