import test from 'node:test';
import assert from 'node:assert/strict';
import {testDatabase} from './helpers/d1.mjs';
import * as operations from '../src/operations.mjs';
import worker from '../src/worker.mjs';
import {evaluateOperationsAlerts,readOperationsAlerts} from '../src/operations-alerts.mjs';

test('scheduled signals reuse operations health without scanning post totals or history',async()=>{
 const {DB,sqlite}=testDatabase(),queries=[];
 try{
  assert.equal(typeof operations.readOperationsState,'function');
  const observed={prepare(sql){queries.push(sql);return DB.prepare(sql);}};
  const data=await operations.readOperationsState({DB:observed},{details:false});
  assert.equal(data.x.enabled,false);assert.equal(data.manual.enabled,false);
  assert.ok(!queries.some(sql=>sql.includes('COUNT(*) FROM posts')||sql.includes('operations_history')));
 }finally{sqlite.close();}
});

test('operations alert reads are private and do not change state or launch checks',async()=>{
 const {DB,sqlite}=testDatabase();
 try{
  const before=sqlite.prepare('SELECT total_changes() n').get().n;
  const response=await operations.handleOperations(new Request('https://test.local/api/admin/operations'),{DB});
  const data=await response.json();
  assert.equal(response.status,200);assert.equal(data.alerts.status,'ok');assert.deepEqual(data.alerts.active,[]);assert.deepEqual(data.alerts.events,[]);assert.equal(data.alerts.checkedAt,null);
  assert.match(response.headers.get('cache-control'),/private.*no-store/);
  assert.equal(sqlite.prepare('SELECT total_changes() n').get().n,before);
 }finally{sqlite.close();}
});

test('alert cron does not dispatch collection or manual-media work',async t=>{
 const {DB,sqlite}=testDatabase();let external=0;
 t.mock.method(globalThis,'fetch',async()=>{external++;throw Error('unexpected provider');});
 try{
  await worker.scheduled({cron:'4-59/5 * * * *'},{DB,MANUAL_MEDIA_ENABLED:'true'},{waitUntil(){assert.fail('No provider work allowed');}});
  const data=await (await operations.handleOperations(new Request('https://test.local/api/admin/operations'),{DB})).json();
  assert.ok(data.alerts.checkedAt);assert.equal(external,0);
 }finally{sqlite.close();}
});

test('unavailable alert storage does not hide current operations or fake an empty healthy inbox',async()=>{
 const {DB,sqlite}=testDatabase();
 try{
  sqlite.exec('DROP TABLE operations_alert_events');
  const response=await operations.handleOperations(new Request('https://test.local/api/admin/operations'),{DB});
  const data=await response.json();assert.equal(response.status,200);assert.equal(data.alerts.status,'unavailable');assert.deepEqual(data.totals,{x:0,instagram:0,manual:0});
 }finally{sqlite.close();}
});

test('real Instagram running signals preserve overdue pending work for sustained alerts',async()=>{
 const {DB,sqlite}=testDatabase();
 try{
  sqlite.exec("INSERT INTO instagram_sync(id,task_id,last_checked_at,next_due_at,lease_until) VALUES(1,'testTask',datetime('now','-2 hours'),unixepoch()+3600,unixepoch()+3600); INSERT INTO instagram_sync_runs(id,task_id,dataset_id,finished_at,state,next_due_at) VALUES('pending','testTask','local-only',datetime('now','-2 hours'),'pending',unixepoch()-3600)");
  const env={DB,APIFY_SYNC_ENABLED:'true',APIFY_TASK_ID:'testTask',APIFY_TOKEN:'test-only'};
  const load=()=>operations.readOperationsState(env,{details:false});const state=await load();
  assert.equal(state.instagram.status,'running');assert.equal(state.instagram.overdue,0);assert.equal(state.instagram.pendingOverdue,1);
  const now=Date.now();await evaluateOperationsAlerts(env,load,now);await evaluateOperationsAlerts(env,load,now+900000);
  assert.ok((await readOperationsAlerts(DB,now+900000)).active.some(item=>item.key==='instagram'));
 }finally{sqlite.close();}
});
