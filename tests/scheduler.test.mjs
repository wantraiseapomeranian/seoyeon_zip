import test from 'node:test';
import assert from 'node:assert/strict';
import { testDatabase } from './helpers/d1.mjs';
import { runDueSource } from '../src/scheduler.mjs';
import { stopCollection } from '../src/collection-state.mjs';

const direct=()=>({type:'status',id:'123',url:'https://x.com/Seowoo_0501/status/123',author:{screen_name:'Seowoo_0501'},reposted_by:null,text:'',created_at:new Date().toISOString(),media:{all:[{type:'photo',url:'https://pbs.twimg.com/media/example.jpg'}]}});
const response=()=>Response.json({code:200,results:[direct()],cursor:{bottom:'next'}});
test('disabled scheduler makes no DB or provider calls',async t=>{
  t.mock.method(globalThis,'fetch',()=>{throw Error('unexpected fetch');});
  assert.equal((await runDueSource({DB:{}})).status,'disabled');
});
test('one page per invocation; direct photo saved; logging failure does not change committed outcome',async t=>{
  const {DB,sqlite,enable}=testDatabase();t.after(()=>sqlite.close());enable();
  sqlite.exec("CREATE TRIGGER fail_log BEFORE INSERT ON runs BEGIN SELECT RAISE(ABORT,'log failure'); END");
  const fetch=t.mock.method(globalThis,'fetch',async()=>response());t.mock.method(console,'log',()=>{});
  const result=await runDueSource({DB,COLLECTION_ENABLED:'true'});
  assert.equal(result.status,'stored');assert.equal(result.warning,'observation_log_failed');
  assert.equal(fetch.mock.callCount(),1);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM posts').get().n,1);
  const state=sqlite.prepare('SELECT * FROM collection_state WHERE source=?').get('Seowoo_0501');
  assert.ok(state.last_success_at);assert.equal(state.next_cursor,'next');assert.equal(state.failures,0);
});
test('401 stops; 429 backs off and keeps cycle fixed; unexpected 204 does not complete',async t=>{
  const {DB,sqlite,enable}=testDatabase();t.after(()=>sqlite.close());enable();t.mock.method(console,'log',()=>{});
  const fetch=t.mock.method(globalThis,'fetch',async()=>new Response(null,{status:429,headers:{'Retry-After':'120'}}));
  const first=await runDueSource({DB,COLLECTION_ENABLED:'true'});assert.equal(first.status,'retry');
  const get=()=>sqlite.prepare('SELECT * FROM collection_state WHERE source=?').get('Seowoo_0501');
  const initial=get();assert.equal(initial.next_due_at-initial.last_attempt_at,120);
  assert.equal(initial.committed_boundary_at,null);
  sqlite.exec('UPDATE collection_state SET next_due_at=0');
  fetch.mock.mockImplementation(async()=>new Response(null,{status:401}));
  assert.equal((await runDueSource({DB,COLLECTION_ENABLED:'true'})).status,'needs_attention');
  assert.equal(get().cycle_started_at,initial.cycle_started_at);
  assert.equal((await runDueSource({DB,COLLECTION_ENABLED:'true'})).status,'idle');
  sqlite.exec("UPDATE collection_state SET next_due_at=0,catchup_status='running'");
  fetch.mock.mockImplementation(async()=>new Response(null,{status:204}));
  assert.equal((await runDueSource({DB,COLLECTION_ENABLED:'true'})).status,'needs_attention');
  assert.equal(get().last_complete_sync_at,null);
});
test('stop during fetch rejects commit; no second provider call on stale execution',async t=>{
  const {DB,sqlite,enable}=testDatabase();t.after(()=>sqlite.close());enable();t.mock.method(console,'log',()=>{});
  const fetch=t.mock.method(globalThis,'fetch',async()=>{await stopCollection(DB);return response();});
  assert.equal((await runDueSource({DB,COLLECTION_ENABLED:'true'})).status,'stale');
  assert.equal(fetch.mock.callCount(),1);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM posts').get().n,0);
});
test('six due sources each get one turn; matching-zero pages still progress',async t=>{
  const {DB,sqlite,enable}=testDatabase();t.after(()=>sqlite.close());enable();sqlite.exec('UPDATE collection_state SET enabled=1');
  t.mock.method(console,'log',()=>{});
  const seen=[];t.mock.method(globalThis,'fetch',async url=>{seen.push(new URL(url).pathname);return Response.json({code:200,results:[],cursor:{bottom:'next'}});});
  for(let i=0;i<6;i++) assert.equal((await runDueSource({DB,COLLECTION_ENABLED:'true'})).status,'stored');
  assert.equal(new Set(seen).size,6);assert.equal((await runDueSource({DB,COLLECTION_ENABLED:'true'})).status,'idle');
});

test('concurrent invocations cannot collect the same leased source twice',async t=>{
  const {DB,sqlite,enable}=testDatabase();t.after(()=>sqlite.close());enable();t.mock.method(console,'log',()=>{});
  const fetch=t.mock.method(globalThis,'fetch',async()=>response());
  const results=await Promise.all([runDueSource({DB,COLLECTION_ENABLED:'true'}),runDueSource({DB,COLLECTION_ENABLED:'true'})]);
  assert.deepEqual(results.map(r=>r.status).sort(),['idle','stored']);assert.equal(fetch.mock.callCount(),1);
});
test('old posts outside the fixed seven-day range are not stored or mistaken for completion',async t=>{
  const {DB,sqlite,enable}=testDatabase();t.after(()=>sqlite.close());enable();t.mock.method(console,'log',()=>{});
  t.mock.method(globalThis,'fetch',async()=>Response.json({code:200,results:[{...direct(),created_at:'2000-01-01T00:00:00Z'}],cursor:{bottom:'next'}}));
  const result=await runDueSource({DB,COLLECTION_ENABLED:'true'});
  assert.equal(result.stored,0);assert.equal(result.cycleStatus,'running');
  const state=sqlite.prepare('SELECT * FROM collection_state WHERE source=?').get('Seowoo_0501');
  assert.equal(state.last_complete_sync_at,null);assert.equal(state.next_cursor,'next');
});
