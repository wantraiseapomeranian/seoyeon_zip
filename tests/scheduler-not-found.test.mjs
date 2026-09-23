import test from 'node:test';
import assert from 'node:assert/strict';
import {testDatabase} from './helpers/d1.mjs';
import {runDueSource} from '../src/scheduler.mjs';

for(const kind of ['http','json']){
 test(`${kind} 404 retries twice then stops without advancing the checkpoint`,async t=>{
  const {DB,sqlite,enable}=testDatabase();t.after(()=>sqlite.close());enable();
  sqlite.exec("UPDATE collection_state SET next_cursor='saved',cycle_started_at=100,cycle_boundary_at=50,committed_boundary_at=75,pages_in_cycle=4,history_paused=1 WHERE source='Seowoo_0501'");
  t.mock.method(console,'log',()=>{});
  const fetch=t.mock.method(globalThis,'fetch',async()=>kind==='http'?new Response(null,{status:404}):Response.json({code:404}));
  const state=()=>sqlite.prepare("SELECT * FROM collection_state WHERE source='Seowoo_0501'").get();
  for(let attempt=1;attempt<=3;attempt++){
   const result=await runDueSource({DB,COLLECTION_ENABLED:'true'});
   assert.equal(result.status,attempt<3?'retry':'needs_attention');
   const row=state();assert.equal(row.failures,attempt);
   assert.equal(row.last_error_code,kind==='http'?'provider_http_error:404':'provider_json_error:404');
   assert.deepEqual([row.next_cursor,row.cycle_started_at,row.cycle_boundary_at,row.committed_boundary_at,row.pages_in_cycle],['saved',100,50,75,4]);
   assert.equal(row.last_success_at,null);assert.equal(row.lease_token,null);
   if(attempt<3)assert.ok(Math.abs(row.next_due_at-row.last_attempt_at-1800*attempt)<=2);
   sqlite.exec('UPDATE collection_state SET next_due_at=0');
  }
  assert.equal((await runDueSource({DB,COLLECTION_ENABLED:'true'})).status,'idle');
  assert.equal(fetch.mock.callCount(),3);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM posts').get().n,0);
 });
}

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
