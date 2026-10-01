import test from 'node:test';
import assert from 'node:assert/strict';
import {testDatabase} from './helpers/d1.mjs';
import {runDueSource} from '../src/scheduler.mjs';

for(const kind of ['http','json']){
 test(`${kind} 404 keeps checking with capped backoff without advancing the checkpoint`,async t=>{
  const {DB,sqlite,enable}=testDatabase();t.after(()=>sqlite.close());enable();
  sqlite.exec("UPDATE collection_state SET next_cursor='saved',cycle_started_at=100,cycle_boundary_at=50,committed_boundary_at=75,pages_in_cycle=4,history_paused=1 WHERE source='Seowoo_0501'");
  t.mock.method(console,'log',()=>{});
  const fetch=t.mock.method(globalThis,'fetch',async()=>kind==='http'?new Response(null,{status:404}):Response.json({code:404}));
  const state=()=>sqlite.prepare("SELECT * FROM collection_state WHERE source='Seowoo_0501'").get();
  for(let attempt=1;attempt<=7;attempt++){
   const result=await runDueSource({DB,COLLECTION_ENABLED:'true'});
   assert.equal(result.status,'retry');
   const row=state();assert.equal(row.failures,attempt);
   assert.equal(row.last_error_code,kind==='http'?'provider_http_error:404':'provider_json_error:404');
   assert.deepEqual([row.next_cursor,row.cycle_started_at,row.cycle_boundary_at,row.committed_boundary_at,row.pages_in_cycle],['saved',100,50,75,4]);
   assert.equal(row.last_success_at,null);assert.equal(row.lease_token,null);
   assert.ok(Math.abs(row.next_due_at-row.last_attempt_at-Math.min(1800*2**(attempt-1),21600))<=2);
   assert.equal((await runDueSource({DB,COLLECTION_ENABLED:'true'})).status,'idle');
   if(attempt<7)sqlite.exec('UPDATE collection_state SET next_due_at=0');
  }
  assert.equal((await runDueSource({DB,COLLECTION_ENABLED:'true'})).status,'idle');
  assert.equal(fetch.mock.callCount(),7);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM posts').get().n,0);
 });
}

for(const code of ['provider_http_error:404','provider_json_error:404']){
 test(`legacy ${code} stop automatically recovers after its due time`,async t=>{
  const {DB,sqlite,enable}=testDatabase();t.after(()=>sqlite.close());enable();
  sqlite.prepare("UPDATE collection_state SET catchup_status='needs_attention',last_error_code=?,failures=3,next_cursor='saved',cycle_started_at=100,cycle_boundary_at=50,committed_boundary_at=75,pages_in_cycle=4,history_paused=1,next_due_at=unixepoch()+3600 WHERE source='Seowoo_0501'").run(code);
  t.mock.method(console,'log',()=>{});
  const fetch=t.mock.method(globalThis,'fetch',async()=>Response.json({code:200,results:[],cursor:{bottom:'new-page'}}));
  assert.equal((await runDueSource({DB,COLLECTION_ENABLED:'true'})).status,'idle');
  sqlite.exec('UPDATE collection_state SET next_due_at=0');
  assert.equal((await runDueSource({DB,COLLECTION_ENABLED:'true'})).status,'stored');
  const row=sqlite.prepare("SELECT * FROM collection_state WHERE source='Seowoo_0501'").get();
  assert.equal(row.failures,0);assert.ok(row.last_success_at);assert.equal(row.catchup_status,'gap');
  assert.equal(row.last_error_code,'history_window_unverified');
  assert.deepEqual([row.next_cursor,row.cycle_started_at,row.cycle_boundary_at,row.committed_boundary_at,row.pages_in_cycle],['saved',100,50,75,4]);
  assert.equal(fetch.mock.callCount(),1);
 });
}

test('legacy 404 recovery respects manual stop, global stop, active leases, and unrelated attention errors',async t=>{
 const {DB,sqlite,enable}=testDatabase();t.after(()=>sqlite.close());enable();
 t.mock.method(globalThis,'fetch',()=>{throw Error('unexpected provider call');});
 const set=sql=>sqlite.exec("UPDATE collection_state SET "+sql+" WHERE source='Seowoo_0501'");
 set("catchup_status='needs_attention',last_error_code='provider_http_error:404',failures=3,enabled=0");
 assert.equal((await runDueSource({DB,COLLECTION_ENABLED:'true'})).status,'idle');
 set('enabled=1');sqlite.exec('UPDATE collection_control SET enabled=0');
 assert.equal((await runDueSource({DB,COLLECTION_ENABLED:'true'})).status,'idle');
 sqlite.exec('UPDATE collection_control SET enabled=1');set("lease_token='another',lease_until=unixepoch()+3600");
 assert.equal((await runDueSource({DB,COLLECTION_ENABLED:'true'})).status,'idle');
 set('lease_token=NULL,lease_until=NULL');
 for(const code of ['provider_http_error:401','provider_http_error:403','provider_http_error:400','provider_schema','invalid_json','unknown_source','unexpected_204:204']){
  sqlite.prepare("UPDATE collection_state SET last_error_code=? WHERE source='Seowoo_0501'").run(code);
  assert.equal((await runDueSource({DB,COLLECTION_ENABLED:'true'})).status,'idle',code);
 }
});

test('a recovered legacy 404 lease still rejects storage after collection is stopped',async t=>{
 const {DB,sqlite,enable}=testDatabase();t.after(()=>sqlite.close());enable();
 sqlite.exec("UPDATE collection_state SET catchup_status='needs_attention',last_error_code='provider_http_error:404',failures=3 WHERE source='Seowoo_0501'");
 t.mock.method(globalThis,'fetch',async()=>{sqlite.exec('UPDATE collection_control SET enabled=0,revision=revision+1');return Response.json({code:200,results:[],cursor:{bottom:'next'}});});
 assert.equal((await runDueSource({DB,COLLECTION_ENABLED:'true'})).status,'stale');
 assert.equal(sqlite.prepare("SELECT last_success_at FROM collection_state WHERE source='Seowoo_0501'").get().last_success_at,null);
});

test('persistent history 404 keeps its cursor, respects Retry-After, and leaves room for another source',async t=>{
 const {DB,sqlite,enable}=testDatabase();t.after(()=>sqlite.close());enable();
 sqlite.exec("UPDATE collection_state SET failures=8,next_lane='history',next_cursor='saved',cycle_started_at=100,cycle_boundary_at=50 WHERE source='Seowoo_0501'; UPDATE collection_state SET enabled=1,next_due_at=1 WHERE source='WEV86_'");
 t.mock.method(console,'log',()=>{});
 const urls=[];t.mock.method(globalThis,'fetch',async url=>{
  urls.push(new URL(url));
  return urls.length===1?new Response(null,{status:404,headers:{'Retry-After':'43200'}}):Response.json({code:200,results:[],cursor:{bottom:'next'}});
 });
 const failed=await runDueSource({DB,COLLECTION_ENABLED:'true'});
 assert.equal(failed.status,'retry');assert.equal(failed.source,'Seowoo_0501');
 assert.equal(urls[0].searchParams.get('cursor'),'saved');
 const row=sqlite.prepare("SELECT * FROM collection_state WHERE source='Seowoo_0501'").get();
 assert.equal(row.next_cursor,'saved');assert.equal(row.next_lane,'history');
 assert.ok(Math.abs(row.next_due_at-row.last_attempt_at-43200)<=2);
 assert.equal((await runDueSource({DB,COLLECTION_ENABLED:'true'})).source,'WEV86_');
 assert.equal(urls.length,2);
});

test('successful retry clears the failure budget; authorization errors still stop immediately',async t=>{
 const {DB,sqlite,enable}=testDatabase();t.after(()=>sqlite.close());enable();
 t.mock.method(console,'log',()=>{});
 const fetch=t.mock.method(globalThis,'fetch',async()=>new Response(null,{status:404}));
 assert.equal((await runDueSource({DB,COLLECTION_ENABLED:'true'})).status,'retry');
 sqlite.exec('UPDATE collection_state SET next_due_at=0');
 fetch.mock.mockImplementation(async()=>Response.json({code:200,results:[],cursor:{bottom:'next'}}));
 assert.equal((await runDueSource({DB,COLLECTION_ENABLED:'true'})).status,'stored');
 const row=sqlite.prepare("SELECT failures,last_error_code,last_success_at FROM collection_state WHERE source='Seowoo_0501'").get();
 assert.equal(row.failures,0);assert.equal(row.last_error_code,null);assert.ok(row.last_success_at);
 sqlite.exec('UPDATE collection_state SET next_due_at=0');
 fetch.mock.mockImplementation(async()=>new Response(null,{status:404}));
 assert.equal((await runDueSource({DB,COLLECTION_ENABLED:'true'})).status,'retry');
 for(const status of [401,403]){
  sqlite.exec("UPDATE collection_state SET next_due_at=0,catchup_status='retry'");
  fetch.mock.mockImplementation(async()=>new Response(null,{status}));
  assert.equal((await runDueSource({DB,COLLECTION_ENABLED:'true'})).status,'needs_attention');
 }
});
