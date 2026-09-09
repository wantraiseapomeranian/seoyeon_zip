import { fetchPage,matchesSeoyeon } from '../src/collection.mjs';
import {writeFileSync} from 'node:fs';
const samples=[],pages=[],counts=new Map(),seen=new Set();let cursor=null;
for(let n=1;n<=10;n++){
 try{
 const r=await fetchPage('triplescosmos',cursor);if(r.kind!=='page')break;
 let added=0;
 for(const p of r.json.results){if(seen.has(p.id))continue;seen.add(p.id);added++;
 const tags=[...p.text.matchAll(/#([\p{L}\p{N}_]+)/gu)].map(m=>m[1]);
 const direct=p.author.screen_name.toLowerCase()==='triplescosmos'&&p.reposted_by===null&&!p.quote&&!p.is_quote_status&&!p.quoted_status&&!p.retweeted_status&&!p.is_retweet;
 for(const tag of new Set(tags)){const key=tag.normalize('NFKC').toLowerCase();const c=counts.get(key)||{tag:key,direct:0,other:0};c[direct?'direct':'other']++;counts.set(key,c);}
 const memberTag=tags.some(t=>/^(?:윤서연|서연|seoyeon|ソヨン)$/iu.test(t.normalize('NFKC')));
 if(matchesSeoyeon(p.text))samples.push({id:p.id,url:p.url,date:new Date(p.created_at).toISOString(),author:p.author.screen_name,direct,memberTag,tags,text:p.text,media:(p.media?.all||[]).map(m=>m.type)});
 }
 pages.push({page:n,http:r.observation.http,received:r.json.results.length,unique:added});
 const next=r.json.cursor.bottom;if(!next||next===cursor)break;cursor=next;
 }catch(e){pages.push({page:n,error:e.code||e.message});break;}
}
const result={at:new Date().toISOString(),pages,uniquePosts:seen.size,tags:[...counts.values()].sort((a,b)=>(b.direct+b.other)-(a.direct+a.other)),samples};
writeFileSync('.local/official-hashtag-analysis.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(result));
