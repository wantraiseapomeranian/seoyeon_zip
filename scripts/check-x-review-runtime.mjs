import assert from 'node:assert/strict';
import {readFileSync,readdirSync,mkdirSync,writeFileSync} from 'node:fs';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
if(process.argv[2]!=='--local')throw Error('Use --local; this script only uses a temporary local D1 database.');
const entry=`import {readXReview} from './src/x-review-query.mjs';
import {legacyXReview} from './tests/helpers/x-review-legacy.mjs';
export default {async fetch(request,env){
 const stats={rowsRead:0,rowsWritten:0,returnedRows:0,returnedBytes:0,maxCellBytes:0,statements:0};
 const record=r=>{stats.rowsRead+=r.meta?.rows_read??0;stats.rowsWritten+=r.meta?.rows_written??0;stats.returnedRows+=r.results?.length??0;stats.returnedBytes+=new TextEncoder().encode(JSON.stringify(r.results??[])).length;stats.statements++;for(const row of r.results??[])for(const value of Object.values(row))if(typeof value==='string')stats.maxCellBytes=Math.max(stats.maxCellBytes,new TextEncoder().encode(value).length);return r;};
 function wrap(inner){return {_inner:inner,bind(...args){return wrap(inner.bind(...args));},async all(){return record(await inner.all());},async first(){return (await this.all()).results[0]??null;}};}
 const DB={prepare:sql=>wrap(env.DB.prepare(sql)),async batch(statements){return (await env.DB.batch(statements.map(s=>s._inner))).map(record);}};
 const url=new URL(request.url),start=performance.now();const data=url.pathname==='/old'?await (await legacyXReview(DB,url.searchParams)).json():await readXReview(DB,url.searchParams);
 return Response.json({data,stats:{...stats,elapsedMs:Math.round((performance.now()-start)*100)/100}});
}};`;
const bundle=await build({stdin:{contents:entry,resolveDir:process.cwd()},bundle:true,format:'esm',platform:'neutral',conditions:['workerd','worker','browser'],external:['node:*'],write:false});
const mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:'x-review-local',modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-09-09',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],outboundService:()=>{throw Error('No external requests expected');}}]}));
const observations=[];
try{
 const DB=await mf.getD1Database('DB');
 async function migrate(name){let statement='';for(const part of readFileSync('migrations/'+name,'utf8').replace(/^\s*--.*$/gm,'').split(';')){statement+=part+';';if(!statement.replaceAll(';','').trim()){statement='';continue;}if(/CREATE TRIGGER/i.test(statement)&&!/END;\s*$/.test(statement))continue;await DB.prepare(statement).run();statement='';}}
 for(const file of readdirSync('migrations').filter(name=>name.endsWith('.sql')&&!name.startsWith('0021_')).sort())await migrate(file);
 async function seed(from,to){for(let at=from;at<to;at+=100){const posts=Array.from({length:Math.min(100,to-at)},(_,i)=>{const n=at+i,id='x:'+String(n).padStart(7,'0');return {id,authorHandle:'sample',publishedAt:'2026-09-01T00:00:00Z',caption:'x'.repeat(1024),contentKind:'fansite',canonicalUrl:'https://x.com/sample/status/'+n,media:[{kind:'image',previewUrl:'https://pbs.twimg.com/media/'+n+'.jpg'}]};});await DB.batch([
  DB.prepare("INSERT INTO posts SELECT json_extract(value,'$.id'),value FROM json_each(?)").bind(JSON.stringify(posts)),
  DB.prepare("INSERT INTO x_fingerprints(url,hash) SELECT json_extract(value,'$.media[0].previewUrl'),json_extract(value,'$.id') FROM json_each(?)").bind(JSON.stringify(posts))
 ]);}}
 const get=async path=>{const response=await mf.dispatchFetch('https://local.test'+path);assert.equal(response.status,200);return response.json();};
 await seed(0,3000);const preMigration=await get('/old?status=all');
 await migrate('0021_x_review_index.sql');
 assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM x_review_posts').first()).n,3000);
 assert.deepEqual((await get('/old?status=all')).data,preMigration.data);
 for(const size of [3000,6000]){
  if(size===6000)await seed(3000,6000);
  const old=await get('/old?status=all'),current=await get('/new?status=all');assert.deepEqual(current.data,old.data);assert.equal(current.data.items.length,25);assert.equal(current.stats.rowsWritten,0);assert.ok(current.stats.returnedBytes<old.stats.returnedBytes/10);
  observations.push({posts:size,old:old.stats,current:current.stats});
  const last=await get('/new?status=all&offset='+(size-25));assert.equal(last.data.items.length,25);
 }
 // Exercise current-page exact and reverse-near candidates through real workerd/D1.
 await DB.prepare("UPDATE x_fingerprints SET near_url='https://pbs.twimg.com/media/1.jpg' WHERE url='https://pbs.twimg.com/media/5999.jpg'").run();
 assert.deepEqual((await get('/new?status=pending')).data,(await get('/old?status=pending')).data);
 await DB.prepare("UPDATE x_fingerprints SET confirmed_hash='shared' WHERE url IN ('https://pbs.twimg.com/media/0.jpg','https://pbs.twimg.com/media/1.jpg')").run();
 assert.deepEqual((await get('/new?status=all')).data,(await get('/old?status=all')).data);
 await DB.prepare("UPDATE x_fingerprints SET confirmed_hash='dense' WHERE CAST(substr(hash,3) AS INTEGER)<800").run();
 const dense=await get('/new?status=all');assert.deepEqual(dense.data,(await get('/old?status=all')).data);assert.equal(dense.data.items[0].comparisons.length,799);assert.ok(dense.stats.maxCellBytes<2_000_000);observations.push({denseGroup:800,current:dense.stats});
 mkdirSync('.local',{recursive:true});writeFileSync('.local/x-review-pagination-metrics.json',JSON.stringify(observations,null,2)+'\n');console.log(JSON.stringify(observations,null,2));console.log('PASS: workerd/D1 backfill, live triggers, SQL pagination, old/new equivalence, actual D1 query metrics; no remote calls');
}finally{await mf.dispose();}
