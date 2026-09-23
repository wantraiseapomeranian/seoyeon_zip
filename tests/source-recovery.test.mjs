import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {testDatabase} from './helpers/d1.mjs';

const sql=readFileSync(new URL('../scripts/sql/resume-2026-09-23-not-found.sql',import.meta.url),'utf8');
const targets=[['First0806_',870],['sogeumdwarf',866],['triplescosmos',868]];
function seed(sqlite){
 sqlite.exec('UPDATE collection_control SET enabled=1');
 for(const [source,revision] of targets)sqlite.prepare("UPDATE collection_state SET enabled=1,revision=?,failures=1,last_error_code='provider_http_error:404',catchup_status='needs_attention',next_due_at=10,next_cursor='checkpoint',cycle_started_at=4,cycle_boundary_at=2,pages_in_cycle=7,history_paused=1 WHERE source=?").run(revision,source);
}
test('one-time recovery preserves checkpoints and failure budget, leaves other sources unchanged and is idempotent',()=>{
 const {sqlite}=testDatabase();try{
  seed(sqlite);
  const before=sqlite.prepare('SELECT * FROM collection_state ORDER BY source').all().map(row=>({...row}));
  assert.equal(sqlite.prepare(sql).all().length,3);
  const after=sqlite.prepare('SELECT * FROM collection_state ORDER BY source').all().map(row=>({...row}));
  assert.deepEqual(after,before.map(row=>targets.some(([source])=>source===row.source)?{...row,revision:row.revision+1,next_due_at:0,catchup_status:'retry'}:row));
  assert.equal(sqlite.prepare(sql).all().length,0);
 }finally{sqlite.close();}
});
test('recovery refuses changed revisions, active leases, disabled collection and unrelated errors',()=>{
 for(const mutation of [
  'UPDATE collection_state SET revision=revision+1',
  'UPDATE collection_state SET lease_until=unixepoch()+120',
  'UPDATE collection_control SET enabled=0',
  'UPDATE collection_state SET enabled=0',
  "UPDATE collection_state SET last_error_code='provider_http_error:401'",
  "UPDATE collection_state SET catchup_status='retry'",
  'UPDATE collection_state SET failures=2',
 ]){
  const {sqlite}=testDatabase();try{
   seed(sqlite);sqlite.exec(mutation);
   assert.equal(sqlite.prepare(sql).all().length,0,mutation);
  }finally{sqlite.close();}
 }
});
