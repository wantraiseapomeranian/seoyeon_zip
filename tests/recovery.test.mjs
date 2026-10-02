import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const recovery=await import('../scripts/verify-recovery.mjs').catch(()=>({}));

test('isolated restore checks integrity and produces deterministic table digests without row contents',()=>{
 assert.equal(typeof recovery.verifyRecovery,'function');
 const dir=mkdtempSync(join(tmpdir(),'seoyeon-recovery-'));
 try{
  const dump=join(dir,'dump.sql');
  // D1 can export a child table before its referenced table after migrations.
  writeFileSync(dump,"CREATE TABLE audit(id INTEGER PRIMARY KEY,post_id TEXT REFERENCES posts(id));INSERT INTO audit VALUES(1,'1');CREATE TABLE posts(id TEXT PRIMARY KEY,data TEXT);INSERT INTO posts VALUES('1','private fixture');");
  const a=recovery.verifyRecovery(dump,join(dir,'one.sqlite'));
  const b=recovery.verifyRecovery(dump,join(dir,'two.sqlite'));
  assert.equal(a.integrity,'ok');assert.equal(a.foreignKeyViolations,0);
  assert.deepEqual(a.tables,b.tables);assert.equal(a.tables.posts.rows,1);
  assert.match(a.tables.posts.sha256,/^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(a).includes('private fixture'));
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('restore refuses an existing destination and rolls back invalid foreign keys',()=>{
 assert.equal(typeof recovery.verifyRecovery,'function');
 const dir=mkdtempSync(join(tmpdir(),'seoyeon-recovery-'));
 try{
  const dump=join(dir,'dump.sql'),existing=join(dir,'existing.sqlite');
  writeFileSync(existing,'keep');writeFileSync(dump,'CREATE TABLE parent(id INTEGER PRIMARY KEY);CREATE TABLE child(id INTEGER REFERENCES parent(id));INSERT INTO child VALUES(1);');
  assert.throws(()=>recovery.verifyRecovery(dump,existing),/destination_exists/);
  assert.equal(readFileSync(existing,'utf8'),'keep');
  assert.throws(()=>recovery.verifyRecovery(dump,join(dir,'invalid.sqlite')),/foreign_key_check_failed/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
