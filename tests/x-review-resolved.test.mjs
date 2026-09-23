import test from 'node:test';
import assert from 'node:assert/strict';
import {testDatabase} from './helpers/d1.mjs';
import {readXReview} from '../src/x-review-query.mjs';
import {decidePhotos,decideXPost} from '../src/review-mutations.mjs';

for(const action of ['merge','different'])test(`missing originals leave pending after ${action}, without a hide decision`,async t=>{
 const {sqlite,DB}=testDatabase();t.after(()=>sqlite.close());
 const urls=['https://img.test/a','https://img.test/b','https://img.test/c'];
 for(let i=0;i<3;i++){
  const id=`x:${i+1}`;
  sqlite.prepare('INSERT INTO posts VALUES(?,?)').run(id,JSON.stringify({id,media:[{kind:'image',previewUrl:urls[i]}]}));
  sqlite.prepare("INSERT INTO x_quality(post_id,availability) VALUES(?,'missing')").run(id);
  sqlite.prepare('INSERT INTO x_fingerprints(url,hash,near_url) VALUES(?,?,?)').run(urls[i],`hash-${i}`,i?urls[0]:null);
 }
 const pending=()=>readXReview(DB,new URLSearchParams('status=pending'));
 const act=(action,revision,right=urls[1])=>decidePhotos(DB,{action,left:urls[0],right,image:urls[0],groupRevision:revision,requestId:crypto.randomUUID(),reasonCode:{merge:'DUPLICATE_IMAGE',different:'DISTINCT_IMAGE',unmerge:'GROUP_CORRECTION'}[action]},{id:'owner@example.test'});
 assert.equal((await pending()).total,3);
 await act(action,0);
 assert.deepEqual(new Set((await pending()).items.map(p=>p.id)),new Set(['x:1','x:3']),'another unresolved photo still needs review');
 await act(action,1,urls[2]);
 assert.equal((await pending()).total,0);
 const hidden=await readXReview(DB,new URLSearchParams('status=hidden'));
 assert.equal(hidden.total,3);
 assert.ok(hidden.items.every(p=>p.availability==='missing'&&p.decision==='auto'&&!p.visible));
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM x_feed_posts').get().n,0);
 assert.ok(sqlite.prepare('SELECT revision FROM x_quality').all().every(q=>q.revision===0));
 await decideXPost(DB,{id:'x:2',decision:'hidden',revision:0,requestId:crypto.randomUUID(),reasonCode:'NOT_SEOYEON'},{id:'owner@example.test'});
 const metadata=JSON.parse(sqlite.prepare("SELECT metadata_json FROM review_audit_log WHERE action='HIDE'").get().metadata_json);
 assert.equal(metadata.displayState,'hidden');
 assert.equal(metadata.availability,'missing');
 assert.deepEqual(metadata.reviewReasons,[]);
 sqlite.prepare("UPDATE posts SET data=json_set(data,'$.moderationReason','notice') WHERE id='x:1'").run();
 assert.deepEqual((await pending()).items.map(p=>p.id),['x:1'],'moderation still needs review');
 if(action==='merge'){
  await act('unmerge',2);
  assert.deepEqual(new Set((await pending()).items.map(p=>p.id)),new Set(['x:1','x:3']),'unmerge restores unresolved comparisons');
 }
});
