import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
if(process.argv[2]!=='--local')throw Error('Use --local; only a temporary local D1 database is used.');
const entry=`import worker from './src/worker.mjs';
import {handleOperations} from './src/operations.mjs';
export default {async fetch(request,env){
 if(new URL(request.url).pathname==='/capture'){
  await worker.scheduled({cron:'5 15 * * *'}, {...env,MANUAL_MEDIA_ENABLED:'true',COLLECTION_ENABLED:'true',APIFY_SYNC_ENABLED:'true'}, {waitUntil(){throw Error('Unexpected provider task');}});
  return new Response('captured');
 }
 return handleOperations(request,env);
}};`;
const bundle=await build({stdin:{contents:entry,resolveDir:process.cwd()},bundle:true,format:'esm',platform:'neutral',conditions:['workerd','worker','browser'],external:['node:*'],write:false});
const mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:'operations-local',modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-09-09',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],outboundService:()=>{throw Error('No external requests expected');}}]}));
try{
 const DB=await mf.getD1Database('DB');
 for(const file of readdirSync('migrations').filter(name=>name.endsWith('.sql')).sort()){
  let statement='';
  for(const part of readFileSync('migrations/'+file,'utf8').replace(/^\s*--.*$/gm,'').split(';')){
   statement+=part+';';if(!statement.replaceAll(';','').trim()){statement='';continue;}
   if(/CREATE TRIGGER/i.test(statement)&&!/END;\s*$/.test(statement))continue;
   await DB.prepare(statement).run();statement='';
  }
 }
 const posts=Array.from({length:100},(_,i)=>({id:'x:'+i,authorHandle:'sample',publishedAt:'2026-09-01T00:00:00Z',caption:'테스트 자료',contentKind:'fansite',canonicalUrl:'https://x.com/sample/status/'+i,media:[]}));
 await DB.prepare("INSERT INTO posts SELECT json_extract(value,'$.id'),value FROM json_each(?)").bind(JSON.stringify(posts)).run();
 assert.equal((await mf.dispatchFetch('https://local.test/capture')).status,200);
 const read=async()=>{const response=await mf.dispatchFetch('https://local.test/operations');assert.equal(response.status,200);return response.json();};
 const first=await read(),snapshot=first.history.items[0];
 assert.equal(first.history.status,'ok');assert.equal(snapshot.totals.x,100);assert.equal(snapshot.query.status,'ok');assert.equal(snapshot.delta,null);
 assert.ok(snapshot.databaseBytes>0);assert.ok(snapshot.query.rowsRead>0);assert.ok(snapshot.query.sqlMs>=0);assert.ok(snapshot.query.resultBytes>0);
 assert.equal((await mf.dispatchFetch('https://local.test/capture')).status,200);
 assert.deepEqual((await read()).history,first.history);
 assert.equal((await DB.prepare('SELECT COUNT(*) n FROM operations_history').first()).n,1);
 assert.equal((await DB.prepare('SELECT COUNT(*) n FROM posts').first()).n,100);
 console.log(JSON.stringify(snapshot));
 console.log('PASS: actual workerd/D1 daily scheduled isolation, non-null metrics, idempotent snapshot, read-only operations history, no external requests');
}finally{await mf.dispose();}
