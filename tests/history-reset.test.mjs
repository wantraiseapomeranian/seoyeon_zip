import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {testDatabase} from './helpers/d1.mjs';
import {acquireDueSource,commitPage} from '../src/collection-state.mjs';

test('history reset fences old writers, preserves data and stop/backoff state',async t=>{
 const {DB,sqlite,enable}=testDatabase();t.after(()=>sqlite.close());enable();
 sqlite.exec("INSERT INTO posts(id,data) VALUES('kept','{}'); UPDATE collection_state SET pages_in_cycle=20,history_paused=1,next_cursor='old',cycle_boundary_at=123,catchup_status='limited'");
 const lease=await acquireDueSource(DB,'old-writer');
 sqlite.exec("UPDATE collection_state SET catchup_status='needs_attention',last_error_code='provider_http:401',failures=1 WHERE source='triplescosmos'; UPDATE collection_state SET catchup_status='retry',last_error_code='provider_http:429',failures=2,next_due_at=9999999999 WHERE source='Pumpkin030806'");
 sqlite.exec(readFileSync(new URL('../migrations/0008_unrestricted_history.sql',import.meta.url),'utf8'));
 await assert.rejects(commitPage(DB,lease,{posts:[]},lease),/stale_lease/);
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM posts').get().n,1);
 const fresh=await acquireDueSource(DB,'new-writer');
 assert.equal(fresh.next_cursor,null);assert.equal(fresh.pages_in_cycle,0);assert.equal(fresh.cycle_boundary_at,0);assert.equal(fresh.next_lane,'latest');assert.equal(fresh.history_paused,0);
 const stopped=sqlite.prepare("SELECT * FROM collection_state WHERE source='triplescosmos'").get();
 assert.equal(stopped.enabled,0);assert.equal(stopped.catchup_status,'needs_attention');assert.equal(stopped.last_error_code,'provider_http:401');
 const retry=sqlite.prepare("SELECT * FROM collection_state WHERE source='Pumpkin030806'").get();
 assert.equal(retry.catchup_status,'retry');assert.equal(retry.next_due_at,9999999999);assert.equal(retry.failures,2);
});
