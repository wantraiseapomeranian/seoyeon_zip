import test from 'node:test';
import assert from 'node:assert/strict';
import {testDatabase} from './helpers/d1.mjs';
import {runDueSource} from '../src/scheduler.mjs';

test('latest reads alternate with saved history; exhaustion does not stop fresh polling',async t=>{
  const {DB,sqlite,enable}=testDatabase();t.after(()=>sqlite.close());enable();t.mock.method(console,'log',()=>{});
  const cursors=[];let next='history-1';
  t.mock.method(globalThis,'fetch',async url=>{cursors.push(new URL(url).searchParams.get('cursor'));return Response.json({code:200,results:[],cursor:{bottom:next}});});
  const state=()=>sqlite.prepare("SELECT * FROM collection_state WHERE source='Seowoo_0501'").get();
  const step=async()=>{sqlite.exec('UPDATE collection_state SET next_due_at=0');return runDueSource({DB,COLLECTION_ENABLED:'true'});};
  await step();assert.equal(state().next_lane,'history');assert.ok(state().last_latest_success_at);
  next='history-2';await step();assert.equal(state().next_lane,'latest');
  next='fresh-tail';await step();assert.equal(state().next_cursor,'history-2');
  next=null;await step();assert.equal(state().catchup_status,'gap');
  next='new-fresh-tail';assert.equal((await step()).status,'stored');
  assert.deepEqual(cursors,[null,'history-1',null,'history-2',null]);
  assert.equal(state().last_complete_sync_at,null);assert.equal(state().next_lane,'latest');
});

test('history page budget is finite while new first-page polls continue',async t=>{
  const {DB,sqlite,enable}=testDatabase();t.after(()=>sqlite.close());enable();t.mock.method(console,'log',()=>{});
  t.mock.method(globalThis,'fetch',async()=>Response.json({code:200,results:[],cursor:{bottom:'tail'}}));
  await runDueSource({DB,COLLECTION_ENABLED:'true'});
  sqlite.exec("UPDATE collection_state SET pages_in_cycle=19,next_cursor='old-tail',next_due_at=0");
  await runDueSource({DB,COLLECTION_ENABLED:'true'});
  const state=()=>sqlite.prepare("SELECT * FROM collection_state WHERE source='Seowoo_0501'").get();
  assert.equal(state().pages_in_cycle,20);assert.equal(state().catchup_status,'limited');
  sqlite.exec('UPDATE collection_state SET next_due_at=0');
  assert.equal((await runDueSource({DB,COLLECTION_ENABLED:'true'})).status,'stored');
  assert.equal(state().pages_in_cycle,20);assert.equal(state().next_cursor,'tail');
  assert.equal(state().last_complete_sync_at,null);
});

test('first-page failure retries the same lane and preserves history',async t=>{
  const {DB,sqlite,enable}=testDatabase();t.after(()=>sqlite.close());enable();t.mock.method(console,'log',()=>{});
  const call=t.mock.method(globalThis,'fetch',async()=>Response.json({code:200,results:[],cursor:{bottom:'tail'}}));
  await runDueSource({DB,COLLECTION_ENABLED:'true'});
  sqlite.exec("UPDATE collection_state SET next_lane='latest',next_due_at=0");
  call.mock.mockImplementation(async()=>new Response(null,{status:429}));
  assert.equal((await runDueSource({DB,COLLECTION_ENABLED:'true'})).status,'retry');
  const state=sqlite.prepare("SELECT * FROM collection_state WHERE source='Seowoo_0501'").get();
  assert.equal(state.next_lane,'latest');assert.equal(state.next_cursor,'tail');
});
