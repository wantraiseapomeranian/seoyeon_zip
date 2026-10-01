import test from 'node:test';
import assert from 'node:assert/strict';
import {testDatabase} from './helpers/d1.mjs';
import {classificationUpdates} from '../scripts/backfill-instagram-kind.mjs';
test('classification backfill preserves review state, manual fields and concurrent imports',()=>{
 const {sqlite}=testDatabase();
 try{
  const data=JSON.stringify({caption:"서연's Cosmo Talk",author:'photo',images:[]});
  sqlite.prepare("INSERT INTO instagram_review(code,data,status,imported_at) VALUES(?,?,'held','2026-09-30')").run('sample',data);
  const manual=JSON.stringify({platform:'instagram',caption:'Photo by _ @photo',authorHandle:'photo',contentKind:'other',manual:true});
  sqlite.prepare('INSERT INTO manual_posts VALUES(?,?,?,?)').run('manual:ig:sample','https://www.instagram.com/p/sample/',manual,'2026-09-30');
  const snapshot=[{table:'instagram_review',key:'sample',data},{table:'manual_posts',key:'manual:ig:sample',data:manual}];
  const updates=classificationUpdates(snapshot);assert.deepEqual(updates.map(u=>u.kind),['cosmo','fansite']);
  for(const u of updates)sqlite.exec(u.sql);
  assert.equal(sqlite.prepare('SELECT status FROM instagram_review').get().status,'held');
  const after=JSON.parse(sqlite.prepare('SELECT data FROM manual_posts').get().data);assert.deepEqual(after,{...JSON.parse(manual),contentKind:'fansite'});
  sqlite.prepare('UPDATE instagram_review SET data=?').run(JSON.stringify({caption:'new caption',author:'photo'}));
  sqlite.exec(updates[0].sql);assert.equal(JSON.parse(sqlite.prepare('SELECT data FROM instagram_review').get().data).contentKind,undefined);
  assert.deepEqual(classificationUpdates([{table:'instagram_review',key:'x',data:JSON.stringify({caption:'COSMO',contentKind:'official'})}]),[]);
  assert.deepEqual(classificationUpdates([{table:'instagram_review',key:'x',data:JSON.stringify({caption:null,author:null})}]),[]);
 }finally{sqlite.close();}
});
