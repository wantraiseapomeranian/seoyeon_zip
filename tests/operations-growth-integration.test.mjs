import test from 'node:test';
import assert from 'node:assert/strict';
import {testDatabase} from './helpers/d1.mjs';
import {handleOperations} from '../src/operations.mjs';
import worker from '../src/worker.mjs';

test('operations reads saved history without running measurements or writing',async()=>{
 const {DB,sqlite}=testDatabase();
 try{
  const before=sqlite.prepare('SELECT total_changes() n').get().n;
  const result=await handleOperations(new Request('https://test.local/api/admin/operations'),{DB});
  const data=await result.json();
  assert.equal(result.status,200);
  assert.deepEqual(data.history,{status:'ok',items:[]});
  assert.equal(sqlite.prepare('SELECT total_changes() n').get().n,before);
 }finally{sqlite.close();}
});

test('missing history storage leaves current operations available',async()=>{
 const {DB,sqlite}=testDatabase();
 try{
  sqlite.exec('DROP TABLE IF EXISTS operations_history');
  const result=await handleOperations(new Request('https://test.local/api/admin/operations'),{DB});
  const data=await result.json();
  assert.equal(result.status,200);
  assert.deepEqual(data.history,{status:'unavailable',items:[]});
  assert.deepEqual(data.totals,{x:0,instagram:0,manual:0});
 }finally{sqlite.close();}
});

test('daily measurement cron stores one aggregate without triggering enabled providers',async t=>{
 const {DB,sqlite}=testDatabase();let externalCalls=0;
 t.mock.method(globalThis,'fetch',async()=>{externalCalls++;throw Error('provider must not run');});
 try{
  const env={DB,COLLECTION_ENABLED:'true',MANUAL_MEDIA_ENABLED:'true',APIFY_SYNC_ENABLED:'true',APIFY_TOKEN:'test-only',APIFY_TASK_ID:'testTask'};
  await worker.scheduled({cron:'5 15 * * *',scheduledTime:Date.now()},env,{waitUntil(){assert.fail('measurement cron must not schedule provider work');}});
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM operations_history').get().n,1);
  assert.equal(externalCalls,0);
 }finally{sqlite.close();}
});
