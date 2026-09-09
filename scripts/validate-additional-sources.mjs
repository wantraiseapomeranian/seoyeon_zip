import { fetchPage,normalizePage } from '../src/collection.mjs';
import { writeFileSync } from 'node:fs';
const handles=['sogeumdwarf','hamhamm806','S2O806','Pumpkin030806','hampuppy806','triplescosmos'];
const records=[];
for(const handle of handles){
 const record={handle,verifiedDirect:false,pages:[],samples:[]};let cursor=null;
 for(let n=0;n<2;n++){
  try{const {kind,json,observation}=await fetchPage(handle,cursor);if(kind!=='page'){record.status=kind;break;}
   const page=normalizePage(json,{handle,verifiedDirect:false});
   record.pages.push({http:observation.http,received:page.receivedCount,matched:page.posts.length,wallMs:observation.wallMs,reposts:json.results.filter(p=>p.author.screen_name.toLowerCase()!==handle.toLowerCase()).length});
   record.samples.push(...page.posts.slice(0,3).map(p=>({url:p.canonicalUrl,author:p.authorHandle,relationship:p.relationship,kind:p.contentKind,publishedAt:p.publishedAt,caption:p.caption.slice(0,300),media:p.media.map(m=>m.kind)})));
   record.status='list-success';cursor=page.nextCursor;if(page.posts.length||!cursor)break;
  }catch(e){record.status='needs-attention';record.error=e.code||e.message;break;}
 }
 records.push(record);console.log(JSON.stringify(record));
}
writeFileSync('.local/additional-source-validation.json',JSON.stringify({at:new Date().toISOString(),records},null,2));
