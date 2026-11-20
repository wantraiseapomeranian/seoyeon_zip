import test from 'node:test';
import assert from 'node:assert/strict';
import {testDatabase} from './helpers/d1.mjs';
import {readFeed} from '../src/feed.mjs';
import {readXReview} from '../src/x-review-query.mjs';
import {legacyXReview} from './helpers/x-review-legacy.mjs';

test('the official account is the shown original of a shared photo, and review visibility agrees with the feed',async t=>{
 const {sqlite,DB}=testDatabase();t.after(()=>sqlite.close());
 const add=(id,author,hash)=>{
  const url=`https://pbs.twimg.com/media/${id}.jpg`;
  sqlite.prepare('INSERT INTO posts VALUES(?,?)').run('x:'+id,JSON.stringify({id:'x:'+id,publishedAt:'2026-09-01',canonicalUrl:`https://x.com/${author}/status/${id}`,authorHandle:author,observedViaSource:'fan',media:[{kind:'image',previewUrl:url}]}));
  sqlite.prepare('INSERT INTO x_fingerprints(url,hash) VALUES(?,?)').run(url,hash);
 };
 add('1','fan','official');add('2','tripleSCOSMOS','official'); // a fan posted first; the official account's later post wins
 add('3','fan','plain');add('4','other','plain'); // no official copy: the smallest post ID still wins
 const ids=async()=>(await readFeed(DB,new URLSearchParams())).posts.map(p=>p.id).sort();
 const feed=await readFeed(DB,new URLSearchParams());
 assert.deepEqual(feed.posts.map(p=>p.id).sort(),['x:2','x:3']);
 assert.deepEqual(feed.posts.find(p=>p.id==='x:2').duplicateSources.map(s=>s.author),['fan']);
 const review=await readXReview(DB,new URLSearchParams('status=all'));
 assert.deepEqual(Object.fromEntries(review.items.map(p=>[p.id,p.visible])),{'x:1':false,'x:2':true,'x:3':true,'x:4':false});
 assert.deepEqual(review,await (await legacyXReview(DB,new URLSearchParams('status=all'))).json());
 // A hidden official post hands the photo back to the fan copy.
 sqlite.exec("INSERT INTO x_quality(post_id,decision) VALUES('x:2','hidden')");
 assert.deepEqual(await ids(),['x:1','x:3']);
 assert.deepEqual((await readXReview(DB,new URLSearchParams('status=visible'))).items.map(p=>p.id).sort(),['x:1','x:3']);
});
