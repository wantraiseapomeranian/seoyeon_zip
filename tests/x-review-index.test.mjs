import test from 'node:test';
import assert from 'node:assert/strict';
import {testDatabase} from './helpers/d1.mjs';
test('review index follows post insert, update, delete and transaction rollback',()=>{
 const {sqlite}=testDatabase();
 try{
  const post={id:'x:1',authorHandle:'Artist',publishedAt:'2026-09-01T15:00:00Z',media:[{kind:'image',previewUrl:'a'},{kind:'gif',previewUrl:'b'}]};
  sqlite.prepare('INSERT INTO posts VALUES(?,?)').run(post.id,JSON.stringify(post));
  assert.equal(sqlite.prepare('SELECT published_month FROM x_review_posts').get().published_month,'2026-09');
  assert.deepEqual(sqlite.prepare('SELECT position,url,kind FROM x_review_media ORDER BY position').all().map(r=>({...r})),[{position:0,url:'a',kind:'image'},{position:1,url:'b',kind:'gif'}]);
  sqlite.exec('BEGIN');sqlite.prepare('UPDATE posts SET data=? WHERE id=?').run(JSON.stringify({...post,media:[]}),post.id);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM x_review_media').get().n,0);sqlite.exec('ROLLBACK');
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM x_review_media').get().n,2);
  sqlite.prepare('UPDATE posts SET data=? WHERE id=?').run(JSON.stringify({...post,authorHandle:'New',media:[]}),post.id);
  assert.equal(sqlite.prepare('SELECT author,has_unknown FROM x_review_posts').get().author,'New');assert.equal(sqlite.prepare('SELECT has_unknown FROM x_review_posts').get().has_unknown,1);
  sqlite.exec("DELETE FROM posts WHERE id='x:1'");assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM x_review_posts').get().n,0);
 }finally{sqlite.close();}
});
