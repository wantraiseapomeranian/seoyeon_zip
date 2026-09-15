import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
if(process.argv[2]!=='--local')throw Error('Use --local; only a temporary local D1 database is used.');
const entry=`import worker from './src/worker.mjs';
import {handleOperations,readOperationsState} from './src/operations.mjs';
import {evaluateOperationsAlerts} from './src/operations-alerts.mjs';
export default {async fetch(request,env){
 if(new URL(request.url).pathname==='/capture'){
  await worker.scheduled({cron:'5 15 * * *'}, {...env,MANUAL_MEDIA_ENABLED:'true',COLLECTION_ENABLED:'true',APIFY_SYNC_ENABLED:'true'}, {waitUntil(){throw Error('Unexpected provider task');}});
  return new Response('captured');
 }
 if(new URL(request.url).pathname==='/alerts'){
  await worker.scheduled({cron:'4-59/5 * * * *'}, {...env,MANUAL_MEDIA_ENABLED:'true',COLLECTION_ENABLED:'true'}, {waitUntil(){throw Error('Unexpected provider task');}});
  return new Response('checked');
 }
 if(new URL(request.url).pathname==='/expire'){
  return Response.json(await evaluateOperationsAlerts(env,async()=>{
   const data=await readOperationsState({...env,COLLECTION_ENABLED:'true'},{details:false});
   await env.DB.prepare('UPDATE operations_alert_monitor SET lease_until=0 WHERE id=1').run();return data;
  }));
 }
 if(new URL(request.url).pathname==='/later')return Response.json(await evaluateOperationsAlerts(env,()=>readOperationsState({...env,COLLECTION_ENABLED:'true'},{details:false}),Date.now()+300000));
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
 await DB.prepare('UPDATE collection_control SET enabled=1 WHERE id=1').run();
 await DB.prepare("UPDATE collection_state SET enabled=1,failures=1,last_error_code='provider_network',catchup_status='retry',next_due_at=unixepoch()+3600 WHERE source='Seowoo_0501'").run();
 const check=async()=>assert.equal((await mf.dispatchFetch('https://local.test/alerts')).status,200);
 await check();assert.ok((await read()).alerts.checkedAt);assert.equal((await read()).alerts.events.length,0);
 // Advance only the synthetic confirmation timestamps, not the real DB lease clock.
 await DB.batch([DB.prepare("UPDATE operations_alert_state SET bad_since=unixepoch()-900,observed_at=unixepoch()-300 WHERE key='x:Seowoo_0501'"),DB.prepare('UPDATE operations_alert_monitor SET checked_at=unixepoch()-300')]);
 await Promise.all([check(),check()]);let alerts=(await read()).alerts;
 assert.equal(alerts.active.length,1);assert.deepEqual(alerts.events.map(e=>e.type),['problem']);
 await DB.prepare('UPDATE operations_alert_monitor SET checked_at=unixepoch()-1').run();await check();assert.equal((await read()).alerts.events.length,1);
 await DB.prepare('UPDATE operations_alert_monitor SET checked_at=unixepoch()-1').run();
 const heartbeat=(await read()).alerts.checkedAt;
 const expired=await mf.dispatchFetch('https://local.test/expire');assert.equal(expired.status,200);assert.equal((await expired.json()).status,'skipped');
 assert.equal((await read()).alerts.checkedAt,heartbeat);assert.equal((await read()).alerts.events.length,1);
 assert.ok((await DB.prepare('SELECT last_failure_at FROM operations_alert_monitor').first()).last_failure_at);
 await DB.batch([DB.prepare("UPDATE collection_state SET failures=0,last_error_code=NULL,catchup_status='idle',last_success_at=unixepoch() WHERE source='Seowoo_0501'"),DB.prepare('UPDATE operations_alert_monitor SET checked_at=unixepoch()-1')]);
 await check();assert.equal((await read()).alerts.active.length,1);
 const later=await mf.dispatchFetch('https://local.test/later');assert.equal(later.status,200);assert.equal((await later.json()).status,'checked');
 alerts=(await read()).alerts;assert.equal(alerts.active.length,0);assert.deepEqual(alerts.events.map(e=>e.type),['recovered','problem']);
 assert.equal((await DB.prepare('SELECT COUNT(*) n FROM posts').first()).n,100);
 console.log(JSON.stringify(snapshot));
 console.log('PASS: actual workerd/D1 daily and alert cron isolation, metrics, duplicate/fenced alerts, sustained problem and recovery, unchanged posts, no external requests');
}finally{await mf.dispose();}
