import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {testDatabase} from './helpers/d1.mjs';

const missing=['0012_instagram_feed.sql','0013_management.sql','0014_instagram_media.sql','0015_instagram_sync.sql','0016_wev86_source.sql','0017_diverse_sources.sql'];
const files=readdirSync(new URL('../migrations/',import.meta.url)).filter(name=>name.endsWith('.sql')).sort();
const repair=readFileSync(new URL('../scripts/sql/reconcile-2026-09-22-migrations.sql',import.meta.url),'utf8');

for(const alreadyRecorded of [[],[missing[0]]]){
 test(`ledger reconciliation preserves data and is repeatable with ${alreadyRecorded.length} previously recorded repair entries`,()=>{
  const {sqlite}=testDatabase();
  try{
   sqlite.exec('CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT UNIQUE,applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)');
   const record=sqlite.prepare('INSERT INTO d1_migrations(name,applied_at) VALUES(?,?)');
   for(const file of files.filter(name=>!missing.includes(name)||alreadyRecorded.includes(name)))record.run(file,'2026-09-01 00:00:00');
   sqlite.prepare('INSERT INTO posts(id,data) VALUES(?,?)').run('x:ledger-check',JSON.stringify({id:'x:ledger-check',caption:'preserve',media:[]}));
   sqlite.exec("UPDATE collection_state SET revision=12,enabled=1 WHERE source='WEV86_'");
   const previous=sqlite.prepare('SELECT * FROM d1_migrations ORDER BY id').all();
   const schema=()=>sqlite.prepare("SELECT type,name,sql FROM sqlite_schema ORDER BY type,name").all();
   const content=()=>({posts:sqlite.prepare('SELECT * FROM posts ORDER BY id').all(),sources:sqlite.prepare('SELECT * FROM collection_state ORDER BY source').all()});
   const beforeSchema=schema(),beforeContent=content();
   const changedBefore=sqlite.prepare('SELECT total_changes() n').get().n;

   sqlite.exec(repair);

   assert.deepEqual(sqlite.prepare('SELECT name FROM d1_migrations ORDER BY name').all().map(row=>row.name),files);
   assert.equal(sqlite.prepare('SELECT total_changes() n').get().n-changedBefore,6-alreadyRecorded.length);
   for(const row of previous)assert.deepEqual(sqlite.prepare('SELECT * FROM d1_migrations WHERE id=?').get(row.id),row);
   assert.deepEqual(schema(),beforeSchema);
   assert.deepEqual(content(),beforeContent);
   const after=sqlite.prepare('SELECT * FROM d1_migrations ORDER BY id').all();
   const changedAfter=sqlite.prepare('SELECT total_changes() n').get().n;
   sqlite.exec(repair);
   assert.deepEqual(sqlite.prepare('SELECT * FROM d1_migrations ORDER BY id').all(),after);
   assert.equal(sqlite.prepare('SELECT total_changes() n').get().n,changedAfter);
   assert.deepEqual(content(),beforeContent);
  }finally{sqlite.close();}
 });
}
