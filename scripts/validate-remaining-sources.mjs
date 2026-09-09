import {fetchPage,normalizePage} from '../src/collection.mjs';
import {writeFileSync} from 'node:fs';
const at=new Date(),boundary=at.getTime()-7*86400000,records=[];
for(const handle of ['Pumpkin030806','hampuppy806','triplescosmos']){
 const record={handle,pages:[],samples:[]};let cursor=null;const seen=new Set();
 for(let number=1;number<=(handle==='triplescosmos'?5:2);number++){
  try{
   const r=await fetchPage(handle,cursor);if(r.kind!=='page'){record.status=r.kind;break;}
   const p=normalizePage(r.json,{handle,verifiedDirect:false});
   const unique=p.posts.filter(x=>!seen.has(x.id));p.posts.forEach(x=>seen.add(x.id));
   const direct=unique.filter(x=>x.relationship==='direct');
   record.pages.push({number,http:r.observation.http,received:p.receivedCount,matched:p.posts.length,uniqueMatched:unique.length,directMatched:direct.length,recentMatched:unique.filter(x=>Date.parse(x.publishedAt)>=boundary).length,newestReturned:r.json.results.map(x=>new Date(x.created_at).toISOString()).sort().at(-1),newestMatched:unique.map(x=>x.publishedAt).sort().at(-1)});
   for(const x of (handle==='triplescosmos'?direct:unique).slice(0,3))record.samples.push({url:x.canonicalUrl,date:x.publishedAt,relationship:x.relationship,caption:x.caption.slice(0,500),media:x.media.map(m=>m.kind)});
   record.status='list-success';if(!p.nextCursor||p.nextCursor===cursor)break;cursor=p.nextCursor;
   if(handle==='triplescosmos'&&direct.length)break;
  }catch(e){record.status='needs-attention';record.error=e.code||e.message;break;}
 }
 records.push(record);console.log(JSON.stringify(record));
}
writeFileSync('.local/remaining-source-validation.json',JSON.stringify({at:at.toISOString(),boundary:new Date(boundary).toISOString(),records},null,2));
