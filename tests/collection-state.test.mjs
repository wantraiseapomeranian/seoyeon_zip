import test from 'node:test';
import assert from 'node:assert/strict';
import { testDatabase } from './helpers/d1.mjs';
import { acquireDueSource,stopCollection,commitPage,recordFailure } from '../src/collection-state.mjs';
import { startCycle,advanceCycle } from '../src/collection-cycle.mjs';

const page={posts:[],nextCursor:'next',receivedCount:21,traversal:{}};
test('disabled by default; one owner; expired lease rejects both old success and failure',async t=>{
  const {sqlite,DB,enable}=testDatabase();t.after(()=>sqlite.close());
  assert.equal(await acquireDueSource(DB,'off'),null);
  enable();const a=await acquireDueSource(DB,'a');
  assert.equal(await acquireDueSource(DB,'b'),null);
  sqlite.exec('UPDATE collection_state SET lease_until=0');
  const b=await acquireDueSource(DB,'b');assert.ok(b.revision>a.revision);
  await assert.rejects(commitPage(DB,a,page,advanceCycle(startCycle(a,a.db_now),page,a.db_now)),/stale_lease/);
  await assert.rejects(recordFailure(DB,a,startCycle(a,a.db_now),{code:'timeout',nextDueAt:0,status:'retry'}),/stale_lease/);
  assert.equal(sqlite.prepare('SELECT next_cursor FROM collection_state WHERE source=?').get(a.source).next_cursor,null);
});
test('stop then resume invalidates in-flight page and preserves data',async t=>{
  const {sqlite,DB,enable}=testDatabase();t.after(()=>sqlite.close());enable();
  const lease=await acquireDueSource(DB,'a');await stopCollection(DB);enable();
  await assert.rejects(commitPage(DB,lease,page,advanceCycle(startCycle(lease,lease.db_now),page,lease.db_now)),/stale_lease/);
});
test('21 posts commit together; media failure rolls back page and cursor',async t=>{
  const {sqlite,DB,enable}=testDatabase();t.after(()=>sqlite.close());enable();
  const lease=await acquireDueSource(DB,'a');
  const posts=Array.from({length:21},(_,i)=>({id:'x:'+i,media:[{position:0,kind:'image'}]}));
  const full={...page,posts};const next=advanceCycle(startCycle(lease,lease.db_now),full,lease.db_now);
  sqlite.exec("CREATE TRIGGER fail_media BEFORE INSERT ON media BEGIN SELECT RAISE(ABORT,'media failure'); END");
  await assert.rejects(commitPage(DB,lease,full,next),/media failure/);
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM posts').get().n,0);
  assert.equal(sqlite.prepare('SELECT next_cursor FROM collection_state WHERE source=?').get(lease.source).next_cursor,null);
  sqlite.exec('DROP TRIGGER fail_media');await commitPage(DB,lease,full,next);
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM posts').get().n,21);
  assert.equal(sqlite.prepare('SELECT next_cursor FROM collection_state WHERE source=?').get(lease.source).next_cursor,'next');
  sqlite.exec('UPDATE collection_state SET next_due_at=0');
  const retry=await acquireDueSource(DB,'retry');await commitPage(DB,retry,full,next);
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM posts').get().n,21);
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM discoveries').get().n,21);
});

test('official review and cursor commit atomically and replay is idempotent',async t=>{
 const {sqlite,DB,enable}=testDatabase();t.after(()=>sqlite.close());enable('triplescosmos');
 const lease=await acquireDueSource(DB,'review');
 const full={...page,reviewPosts:[{post:{id:'x:12',publishedAt:'2026-09-09T00:00:00Z'},reason:'untagged-personal-content',version:'official-v1'}]};
 const next=advanceCycle(startCycle(lease,lease.db_now),full,lease.db_now);
 sqlite.exec("CREATE TRIGGER fail_review BEFORE INSERT ON official_review BEGIN SELECT RAISE(ABORT,'review failure'); END");
 await assert.rejects(commitPage(DB,lease,full,next),/review failure/);
 assert.equal(sqlite.prepare('SELECT next_cursor FROM collection_state WHERE source=?').get('triplescosmos').next_cursor,null);
 sqlite.exec('DROP TRIGGER fail_review');await commitPage(DB,lease,full,next);
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM official_review').get().n,1);
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM posts').get().n,0);
 sqlite.exec('UPDATE collection_state SET next_due_at=0');const again=await acquireDueSource(DB,'again');await commitPage(DB,again,full,next);
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM official_review').get().n,1);
});

test('page outcome rolls back with data and survives later provider failure',async t=>{
 const {sqlite,DB,enable}=testDatabase();t.after(()=>sqlite.close());enable();
 const lease=await acquireDueSource(DB,'outcome');
 const state=startCycle(lease,lease.db_now),next=advanceCycle(state,page,lease.db_now);
 const read=()=>sqlite.prepare('SELECT last_received_count,last_matched_count,last_review_count FROM collection_state WHERE source=?').get(lease.source);
 assert.equal(read().last_matched_count,null);
 sqlite.exec("CREATE TRIGGER fail_state BEFORE UPDATE OF next_due_at ON collection_state BEGIN SELECT RAISE(ABORT,'state failure'); END");
 await assert.rejects(commitPage(DB,lease,page,next),/state failure/);
 assert.equal(read().last_received_count,null);
 sqlite.exec('DROP TRIGGER fail_state');await commitPage(DB,lease,page,next);
 assert.deepEqual({...read()},{last_received_count:21,last_matched_count:0,last_review_count:0});
 sqlite.exec('UPDATE collection_state SET next_due_at=0');const retry=await acquireDueSource(DB,'fail');
 await recordFailure(DB,retry,startCycle(retry,retry.db_now),{code:'provider_timeout',nextDueAt:retry.db_now+1800,status:'retry'});
 assert.equal(read().last_received_count,21);
});
