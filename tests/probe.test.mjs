import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{handleApi} from '../src/worker.mjs';
import { testDatabase } from './helpers/d1.mjs';

test('retired probe cannot call provider or write data',async t=>{
  t.mock.method(globalThis,'fetch',()=>{throw Error('unexpected provider');});
  assert.equal((await handleApi(new Request('https://example.test/api/probe',{method:'POST'}),{})).status,410);
});
test('retry only schedules runnable sources and preserves leases and boundaries',async t=>{
  const {DB,sqlite,enable}=testDatabase();t.after(()=>sqlite.close());enable();
  t.mock.method(globalThis,'fetch',()=>{throw Error('unexpected provider');});
  sqlite.exec("UPDATE collection_state SET lease_token='live',revision=5,committed_boundary_at=100,next_due_at=9999999999");
  const request=(handle,origin='https://example.test')=>new Request(`https://example.test/api/sources/${handle}/retry`,{method:'POST',headers:{origin,'x-validation-action':'collect'}});
  const env={DB,COLLECTION_ENABLED:'true'};
  assert.equal((await handleApi(request('Seowoo_0501'),env)).status,202);
  const state=sqlite.prepare('SELECT * FROM collection_state WHERE source=?').get('Seowoo_0501');
  assert.equal(state.lease_token,'live');assert.equal(state.revision,5);assert.equal(state.committed_boundary_at,100);
  assert.equal((await handleApi(request('gapyeonghaus'),env)).status,409);
  assert.equal((await handleApi(request('unknown'),env)).status,404);
  assert.equal((await handleApi(request('Seowoo_0501','https://other.test'),env)).status,403);
  assert.equal((await handleApi(request('Seowoo_0501'),{DB})).status,409);
});
test('public source routes remain fail-closed; source API omits lease tokens',async t=>{
  const {DB,sqlite}=testDatabase();t.after(()=>sqlite.close());
  const request=new Request('https://example.test/api/sources');
  assert.equal((await worker.fetch(request,{DB})).status,503);
  const body=await (await handleApi(request,{DB})).json();
  assert.equal(body.sources.length,16);assert.ok(body.sources.every(s=>!('lease_token' in s)));
});
