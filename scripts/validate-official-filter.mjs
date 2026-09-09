import {fetchPage,normalizePage,matchesSeoyeon} from '../src/collection.mjs';
import {writeFileSync} from 'node:fs';
const seen=new Set(),counts={include:0,review:0,exclude:0},reasons={},examples=[],pages=[];let cursor=null,previousRule=0;
for(let i=1;i<=10;i++){
 const r=await fetchPage('triplescosmos',cursor);if(r.kind!=='page')throw Error('Expected page');
 const p=normalizePage(r.json,{handle:'triplescosmos',verifiedDirect:false});
 for(let j=0;j<r.json.results.length;j++){
  const raw=r.json.results[j];if(seen.has(raw.id))continue;seen.add(raw.id);
  const d=p.officialDecisions[j];counts[d.decision]++;reasons[d.reason]=(reasons[d.reason]||0)+1;
  const old=matchesSeoyeon(raw.text)&&(raw.media?.all?.length||0)>0;if(old)previousRule++;
  if(old||d.decision!=='exclude')examples.push({url:raw.url,date:raw.created_at,...d,title:raw.text.split('\n').filter(Boolean).slice(0,5).join(' / '),media:(raw.media?.all||[]).map(m=>m.type)});
 }
 pages.push({number:i,http:r.observation.http,received:p.receivedCount});
 if(!p.nextCursor||p.nextCursor===cursor)break;cursor=p.nextCursor;
}
const result={at:new Date().toISOString(),unique:seen.size,previousRule,counts,reasons,pages,examples};
writeFileSync('.local/official-filter-validation.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
