import test from 'node:test';
import assert from 'node:assert/strict';
import {testDatabase} from './helpers/d1.mjs';
import {runDueSource} from '../src/scheduler.mjs';

const success=()=>Response.json({code:200,results:[],cursor:{bottom:'next'}});
const sourceState=sqlite=>sqlite.prepare("SELECT * FROM collection_state WHERE source='Seowoo_0501'").get();
const providerState=sqlite=>sqlite.prepare("SELECT * FROM provider_retry_state WHERE host='api.fxtwitter.com'").get();
const expire=sqlite=>sqlite.exec('UPDATE provider_retry_state SET next_due_at=1,lease_until=0; UPDATE collection_state SET next_due_at=0');

test('429 pauses other sources without charging either account a failure',async t=>{
  const {DB,sqlite,enable}=testDatabase();t.after(()=>sqlite.close());enable();
  sqlite.exec("UPDATE collection_state SET enabled=1,next_due_at=1 WHERE source='WEV86_'");
  t.mock.method(console,'log',()=>{});
  const fetch=t.mock.method(globalThis,'fetch',async()=>new Response(null,{status:429,headers:{'Retry-After':'7200'}}));
  const env={DB,COLLECTION_ENABLED:'true'};
  assert.equal((await runDueSource(env)).source,'Seowoo_0501');
  const first=sourceState(sqlite);
  const second=await runDueSource(env);
  assert.equal(second.source,'WEV86_');assert.equal(second.status,'retry');
  assert.equal(fetch.mock.callCount(),1);
  const rows=sqlite.prepare('SELECT failures,not_found_failures,next_due_at FROM collection_state WHERE enabled=1').all();
  assert.ok(rows.every(r=>r.failures===0&&r.not_found_failures===0&&r.next_due_at===first.next_due_at));
  assert.equal(providerState(sqlite).rate_limit_failures,1);
  assert.ok(Math.abs(first.next_due_at-first.last_attempt_at-7200)<=2);
});

test('404 and 429 budgets remain separate and a 404 probe releases the provider pause',async t=>{
  const {DB,sqlite,enable}=testDatabase();t.after(()=>sqlite.close());enable();
  sqlite.exec("UPDATE collection_state SET failures=4,next_lane='history',next_cursor='saved',cycle_started_at=100,cycle_boundary_at=50,pages_in_cycle=2 WHERE source='Seowoo_0501'");
  t.mock.method(console,'log',()=>{});
  const fetch=t.mock.method(globalThis,'fetch',async()=>new Response(null,{status:404}));
  const env={DB,COLLECTION_ENABLED:'true'};
  await runDueSource(env);
  let row=sourceState(sqlite);
  assert.equal(row.failures,4);assert.equal(row.not_found_failures,1);
  assert.ok(Math.abs(row.next_due_at-row.last_attempt_at-300)<=2);
  sqlite.exec('UPDATE collection_state SET next_due_at=0');
  fetch.mock.mockImplementation(async()=>new Response(null,{status:429}));
  await runDueSource(env);
  row=sourceState(sqlite);
  assert.equal(row.failures,4);assert.equal(row.not_found_failures,1);
  assert.ok(Math.abs(row.next_due_at-row.last_attempt_at-900)<=2);
  expire(sqlite);
  fetch.mock.mockImplementation(async()=>Response.json({code:404}));
  await runDueSource(env);
  row=sourceState(sqlite);
  assert.equal(row.not_found_failures,2);assert.equal(row.failures,4);
  assert.ok(Math.abs(row.next_due_at-row.last_attempt_at-900)<=2);
  assert.equal(providerState(sqlite).next_due_at,0);
  assert.equal(providerState(sqlite).rate_limit_failures,0);
  assert.deepEqual([row.next_cursor,row.cycle_started_at,row.cycle_boundary_at,row.pages_in_cycle],['saved',100,50,2]);
  assert.equal(row.last_success_at,null);
  sqlite.exec('UPDATE collection_state SET next_due_at=0');
  fetch.mock.mockImplementation(async()=>success());
  assert.equal((await runDueSource(env)).status,'stored');
  row=sourceState(sqlite);assert.equal(row.not_found_failures,0);assert.equal(row.failures,0);
});

test('HTTP and JSON 429 use the provider budget while blocked attempts do not increase it',async t=>{
  const {DB,sqlite,enable}=testDatabase();t.after(()=>sqlite.close());enable();
  t.mock.method(console,'log',()=>{});
  const fetch=t.mock.method(globalThis,'fetch',async()=>Response.json({code:429}));
  const env={DB,COLLECTION_ENABLED:'true'};
  for(const [index,delay] of [900,1800,3600,3600].entries()){
    if(index)expire(sqlite);
    assert.equal((await runDueSource(env)).status,'retry');
    let row=sourceState(sqlite);
    assert.equal(row.failures,0);assert.equal(row.not_found_failures,0);
    assert.ok(Math.abs(row.next_due_at-row.last_attempt_at-delay)<=2);
    assert.equal(providerState(sqlite).rate_limit_failures,index+1);
    sqlite.exec('UPDATE collection_state SET next_due_at=0');
    await runDueSource(env);
    assert.equal(providerState(sqlite).rate_limit_failures,index+1);
    assert.equal(fetch.mock.callCount(),index+1);
  }
});

test('JSON 429 also preserves the server Retry-After header',async t=>{
  const {DB,sqlite,enable}=testDatabase();t.after(()=>sqlite.close());enable();
  t.mock.method(console,'log',()=>{});
  t.mock.method(globalThis,'fetch',async()=>Response.json({code:429},{headers:{'Retry-After':'7200'}}));
  await runDueSource({DB,COLLECTION_ENABLED:'true'});
  const row=sourceState(sqlite);
  assert.ok(Math.abs(row.next_due_at-row.last_attempt_at-7200)<=2);
  assert.equal(providerState(sqlite).next_due_at,row.next_due_at);
});
