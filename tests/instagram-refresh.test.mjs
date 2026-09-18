import test from 'node:test';
import assert from 'node:assert/strict';
import {testDatabase} from './helpers/d1.mjs';
import {importInstagram} from '../src/instagram-import.mjs';
const url=(name,version)=>`https://scontent.cdninstagram.com/${name}.jpg?version=${version}`;
test('URL renewal preserves carousel order, media kinds and moderation including partial responses',async()=>{
 const {DB,sqlite}=testDatabase();
 try{
  const post={shortCode:'Renew_123',type:'Sidecar',childPosts:[{type:'Image',displayUrl:url('one','old')},{type:'Video',displayUrl:url('two','old')}]};
  await importInstagram(DB,[post]);
  sqlite.exec("UPDATE instagram_review SET status='kept',revision=7,reviewed_at='2026-09-01'");
  await importInstagram(DB,[{shortCode:post.shortCode,images:[url('one','new'),url('two','new')]}]);
  const read=()=>{const row=sqlite.prepare('SELECT * FROM instagram_review').get();return {...row,post:JSON.parse(row.data)};};
  let row=read();assert.deepEqual(row.post.images,[url('one','new'),url('two','new')]);
  assert.deepEqual(row.post.media.map(m=>m.kind),['image','video']);
  assert.equal(row.status,'kept');assert.equal(row.revision,7);assert.equal(row.reviewed_at,'2026-09-01');
  await importInstagram(DB,[{shortCode:post.shortCode,displayUrl:url('two','newer')}]);
  row=read();assert.deepEqual(row.post.images,[url('one','new'),url('two','newer')]);
  assert.deepEqual(row.post.media.map(m=>m.kind),['image','video']);
  await importInstagram(DB,[{shortCode:post.shortCode,caption:'updated only'}]);
  assert.deepEqual(read().post.images,row.post.images);
 }finally{sqlite.close();}
});
test('reordered renewed media preserve kinds by identity, not previous array position',async()=>{
 const {DB,sqlite}=testDatabase();try{
  await importInstagram(DB,[{shortCode:'Order_123',type:'Sidecar',childPosts:[{type:'Image',displayUrl:url('one','old')},{type:'Video',displayUrl:url('two','old')}]}]);
  await importInstagram(DB,[{shortCode:'Order_123',images:[url('two','new'),url('one','new')]}]);
  assert.deepEqual(JSON.parse(sqlite.prepare('SELECT data FROM instagram_review').get().data).media.map(m=>m.kind),['video','image']);
 }finally{sqlite.close();}
});
test('ambiguous URL variants cannot drop an unreturned image or assign kinds by position',async()=>{
 const {DB,sqlite}=testDatabase();try{
  const post={shortCode:'Ambiguous_123',type:'Sidecar',childPosts:[{type:'Image',displayUrl:url('one','old')},{type:'Video',displayUrl:url('two','old')}]};
  await importInstagram(DB,[post]);
  const before=JSON.parse(sqlite.prepare('SELECT data FROM instagram_review').get().data);
  await importInstagram(DB,[{shortCode:post.shortCode,images:[url('one','new1'),url('one','new2')]}]);
  assert.deepEqual(JSON.parse(sqlite.prepare('SELECT data FROM instagram_review').get().data).media,before.media);
  await importInstagram(DB,[{shortCode:'Samepath_123',type:'Sidecar',childPosts:[{type:'Image',displayUrl:url('same','one')},{type:'Video',displayUrl:url('same','two')}]}]);
  const snapshot=JSON.parse(sqlite.prepare("SELECT data FROM instagram_review WHERE code='Samepath_123'").get().data);
  await importInstagram(DB,[{shortCode:'Samepath_123',displayUrl:url('same','one')}]);
  assert.deepEqual(JSON.parse(sqlite.prepare("SELECT data FROM instagram_review WHERE code='Samepath_123'").get().data).media,snapshot.media);
 }finally{sqlite.close();}
});
