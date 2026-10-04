import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { testDatabase } from './helpers/d1.mjs';
import { ProviderCooldownError,withProviderRetry } from '../src/provider-retry.mjs';

const HOST='api.fxtwitter.com';
const now=()=>Math.floor(Date.now()/1000);
const rateLimited=retryAfter=>Object.assign(new Error('rate_limited'),{status:429,retryAfter});
const state=sqlite=>sqlite.prepare('SELECT * FROM provider_retry_state WHERE host=?').get(HOST);
const expire=sqlite=>sqlite.prepare('UPDATE provider_retry_state SET next_due_at=?,lease_until=0 WHERE host=?').run(now()-1,HOST);
function deferred() {
  let resolve,reject;
  const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}
async function startHeld(DB) {
  const started=deferred(),held=deferred();
  const result=withProviderRetry(DB,()=>{started.resolve();return held.promise;});
  await started.promise;
  return {result,held};
}

test('normal requests run concurrently and preserve operation results',async t=>{
  const {DB,sqlite}=testDatabase();t.after(()=>sqlite.close());
  const first=await startHeld(DB),second=await startHeld(DB);
  assert.equal(state(sqlite).lease_token,null);
  first.held.resolve('first');second.held.resolve('second');
  assert.deepEqual(await Promise.all([first.result,second.result]),['first','second']);
  assert.equal(state(sqlite).next_due_at,0);
});

test('429 uses shared 15/30/60 minute waits and blocks operations during cooldown',async t=>{
  const {DB,sqlite}=testDatabase();t.after(()=>sqlite.close());
  for(const [index,seconds] of [900,1800,3600,3600].entries()) {
    const before=now();
    await assert.rejects(withProviderRetry(DB,async()=>{throw rateLimited(null);}),error=>{
      assert.ok(error instanceof ProviderCooldownError);
      assert.equal(error.status,429);assert.equal(error.code,'provider_http_error');assert.equal(error.retryAfter,null);
      assert.ok(error.nextDueAt>=before+seconds && error.nextDueAt<=now()+seconds);
      return true;
    });
    assert.equal(state(sqlite).rate_limit_failures,index+1);
    let calls=0;
    await assert.rejects(withProviderRetry(DB,async()=>{calls++;}),ProviderCooldownError);
    assert.equal(calls,0);
    expire(sqlite);
  }
});

test('concurrent 429 responses increment atomically and cannot shorten Retry-After',async t=>{
  const {DB,sqlite}=testDatabase();t.after(()=>sqlite.close());
  const first=await startHeld(DB),second=await startHeld(DB);
  const before=now();
  first.held.reject(rateLimited('7200'));
  await assert.rejects(first.result,ProviderCooldownError);
  const firstDeadline=state(sqlite).next_due_at;
  assert.ok(firstDeadline>=before+7200);
  second.held.reject(rateLimited('60'));
  await assert.rejects(second.result,ProviderCooldownError);
  assert.equal(state(sqlite).next_due_at,firstDeadline);
  assert.equal(state(sqlite).rate_limit_failures,2);
});

test('HTTP-date Retry-After is preserved beyond the fallback cap',async t=>{
  const {DB,sqlite}=testDatabase();t.after(()=>sqlite.close());
  const deadline=now()+10800;
  await assert.rejects(withProviderRetry(DB,async()=>{throw rateLimited(new Date(deadline*1000).toUTCString());}),ProviderCooldownError);
  assert.equal(state(sqlite).next_due_at,deadline);
});

test('a normal successful request cannot erase a concurrent 429 cooldown',async t=>{
  const {DB,sqlite}=testDatabase();t.after(()=>sqlite.close());
  const normal=await startHeld(DB);
  await assert.rejects(withProviderRetry(DB,async()=>{throw rateLimited(null);}),ProviderCooldownError);
  const deadline=state(sqlite).next_due_at;
  normal.held.resolve('ok');
  assert.equal(await normal.result,'ok');
  assert.equal(state(sqlite).next_due_at,deadline);
  assert.equal(state(sqlite).rate_limit_failures,1);
});

test('only one probe runs after cooldown and probe success restores normal access',async t=>{
  const {DB,sqlite}=testDatabase();t.after(()=>sqlite.close());
  await assert.rejects(withProviderRetry(DB,async()=>{throw rateLimited(null);}),ProviderCooldownError);
  expire(sqlite);
  const probe=await startHeld(DB);
  let calls=0;
  await assert.rejects(withProviderRetry(DB,async()=>{calls++;}),error=>{
    assert.ok(error instanceof ProviderCooldownError);
    assert.equal(error.nextDueAt,state(sqlite).lease_until);
    return true;
  });
  assert.equal(calls,0);
  probe.held.resolve('recovered');
  assert.equal(await probe.result,'recovered');
  assert.equal(state(sqlite).next_due_at,0);
  assert.equal(state(sqlite).rate_limit_failures,0);
  assert.equal(state(sqlite).lease_token,null);
  assert.equal(await withProviderRetry(DB,async()=>42),42);
});

test('404 probe errors reopen the provider and remain account-level errors',async t=>{
  const {DB,sqlite}=testDatabase();t.after(()=>sqlite.close());
  await assert.rejects(withProviderRetry(DB,async()=>{throw rateLimited(null);}),ProviderCooldownError);
  expire(sqlite);
  const missing=Object.assign(new Error('provider_json_error'),{status:404});
  await assert.rejects(withProviderRetry(DB,async()=>{throw missing;}),error=>error===missing);
  assert.equal(state(sqlite).next_due_at,0);
  assert.equal(state(sqlite).rate_limit_failures,0);
  assert.equal(await withProviderRetry(DB,async()=>true),true);
});

test('probe network and timeout failures wait 60 seconds without raising the 429 counter',async t=>{
  const {DB,sqlite}=testDatabase();t.after(()=>sqlite.close());
  await assert.rejects(withProviderRetry(DB,async()=>{throw rateLimited(null);}),ProviderCooldownError);
  for(const error of [new TypeError('fetch failed'),new Error('provider_network'),
    new TypeError('terminated',{cause:Object.assign(new Error('other side closed'),{code:'UND_ERR_SOCKET'})}),
    Object.assign(new Error('The operation was aborted'),{name:'AbortError'})]) {
    expire(sqlite);
    const before=now();
    await assert.rejects(withProviderRetry(DB,async()=>{throw error;}),actual=>actual===error);
    assert.ok(state(sqlite).next_due_at>=before+60 && state(sqlite).next_due_at<=now()+60);
    assert.equal(state(sqlite).rate_limit_failures,1);
    assert.equal(state(sqlite).lease_token,null);
  }
});

test('a new 429 invalidates an active probe so its later success cannot clear cooldown',async t=>{
  const {DB,sqlite}=testDatabase();t.after(()=>sqlite.close());
  const oldRequest=await startHeld(DB);
  await assert.rejects(withProviderRetry(DB,async()=>{throw rateLimited(null);}),ProviderCooldownError);
  expire(sqlite);
  const probe=await startHeld(DB);
  oldRequest.held.reject(rateLimited('7200'));
  await assert.rejects(oldRequest.result,ProviderCooldownError);
  const deadline=state(sqlite).next_due_at;
  assert.equal(state(sqlite).lease_token,null);
  probe.held.resolve('ok');
  await probe.result;
  assert.equal(state(sqlite).next_due_at,deadline);
  assert.equal(state(sqlite).rate_limit_failures,2);
});

test('an expired probe lease can be reclaimed and an old probe cannot clear its replacement',async t=>{
  const {DB,sqlite}=testDatabase();t.after(()=>sqlite.close());
  await assert.rejects(withProviderRetry(DB,async()=>{throw rateLimited(null);}),ProviderCooldownError);
  expire(sqlite);
  const oldProbe=await startHeld(DB);
  sqlite.prepare('UPDATE provider_retry_state SET lease_until=? WHERE host=?').run(now()-1,HOST);
  const newProbe=await startHeld(DB);
  const newToken=state(sqlite).lease_token;
  oldProbe.held.resolve('old');await oldProbe.result;
  assert.equal(state(sqlite).lease_token,newToken);
  assert.notEqual(state(sqlite).next_due_at,0);
  newProbe.held.resolve('new');await newProbe.result;
  assert.equal(state(sqlite).next_due_at,0);
});

test('migration separates existing counters and shortens only existing 404 waits',t=>{
  const {sqlite}=testDatabase({beforeProviderRetry:true});t.after(()=>sqlite.close());
  const sources=sqlite.prepare('SELECT source FROM collection_state LIMIT 3').all();
  assert.equal(sources.length,3);
  const migrationNow=sqlite.prepare('SELECT unixepoch() AS now').get().now;
  const errors=['provider_http_error:404','provider_json_error:404','provider_http_error:429'];
  const before=[];
  for(let i=0;i<sources.length;i++) {
    sqlite.prepare('UPDATE collection_state SET failures=?,last_error_code=?,last_attempt_at=?,next_due_at=?,last_success_at=? WHERE source=?')
      .run(i+3,errors[i],migrationNow-100,i<2?migrationNow+20000:migrationNow-10,migrationNow-1000,sources[i].source);
    before.push(sqlite.prepare('SELECT * FROM collection_state WHERE source=?').get(sources[i].source));
  }
  sqlite.exec(readFileSync(new URL('../migrations/0033_provider_retry.sql',import.meta.url),'utf8'));
  for(let i=0;i<sources.length;i++) {
    const after=sqlite.prepare('SELECT * FROM collection_state WHERE source=?').get(sources[i].source);
    const expected={...before[i],failures:0,not_found_failures:i<2?i+3:0};
    if(i<2) expected.next_due_at=migrationNow+1700;
    assert.deepEqual({...after},expected);
  }
  assert.equal(state(sqlite).next_due_at,0);
  assert.equal(state(sqlite).rate_limit_failures,0);
});

test('migration preserves the longest active legacy 429 deadline without summing account failures',t=>{
  const {sqlite}=testDatabase({beforeProviderRetry:true});t.after(()=>sqlite.close());
  const sources=sqlite.prepare('SELECT source FROM collection_state LIMIT 4').all();
  assert.equal(sources.length,4);
  const migrationNow=sqlite.prepare('SELECT unixepoch() AS now').get().now;
  const rows=[
    {error:'provider_http_error:429',due:migrationNow+10800,failures:7},
    {error:'provider_json_error:429',due:migrationNow+21600,failures:11},
    {error:'provider_http_error:429',due:migrationNow-60,failures:50},
    {error:'provider_http_error:404',due:migrationNow+32400,failures:9}
  ];
  for(let i=0;i<rows.length;i++) {
    const row=rows[i];
    sqlite.prepare('UPDATE collection_state SET failures=?,last_error_code=?,last_attempt_at=?,next_due_at=? WHERE source=?')
      .run(row.failures,row.error,migrationNow-100,row.due,sources[i].source);
  }
  sqlite.exec(readFileSync(new URL('../migrations/0033_provider_retry.sql',import.meta.url),'utf8'));
  assert.equal(state(sqlite).next_due_at,migrationNow+21600);
  assert.equal(state(sqlite).rate_limit_failures,1);
  for(let i=0;i<3;i++) {
    const row=sqlite.prepare('SELECT next_due_at,failures,not_found_failures FROM collection_state WHERE source=?').get(sources[i].source);
    assert.equal(row.next_due_at,rows[i].due);
    assert.equal(row.failures,0);
    assert.equal(row.not_found_failures,0);
  }
});
