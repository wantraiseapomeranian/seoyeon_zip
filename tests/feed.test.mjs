import test from 'node:test';
import assert from 'node:assert/strict';
import { readFeed } from '../src/feed.mjs';
import { handleApi } from '../src/worker.mjs';
import { testDatabase } from './helpers/d1.mjs';
import {reviewFilters} from '../src/review-filters.mjs';

test('published day uses KST boundaries in feed and both review filters',async()=>{
 const {sqlite,DB}=testDatabase();try{
 const dates=['2026-09-09T14:59:59.999Z','2026-09-09T15:00:00.000Z','2026-09-10T14:59:59.999Z','2026-09-10T15:00:00.000Z'];
 dates.forEach((date,i)=>add(sqlite,i+1,date));const params=new URLSearchParams({date:'2026-09-10'});
 assert.deepEqual((await readFeed(DB,params)).posts.map(p=>p.id),['x:3','x:2']);
 for(const instagram of [false,true])assert.deepEqual(dates.map(publishedAt=>reviewFilters(params,{instagram}).matches({publishedAt})),[false,true,true,false]);
 for(const date of ['2026-02-29','2026-04-31','2026-13-01','2026-09','bad']){
  await assert.rejects(readFeed(DB,new URLSearchParams({date})),/invalid_feed_query/);
  assert.throws(()=>reviewFilters(new URLSearchParams({date})),/invalid_query/);
 }
 assert.equal((await readFeed(DB,new URLSearchParams({date:'2024-02-29'}))).total,0);
 assert.equal((await readFeed(DB,new URLSearchParams())).total,4);
 }finally{sqlite.close();}
});
function add(sqlite,id,date,kind='image') {
 const post={id:`x:${id}`,publishedAt:date,contentKind:'fansite',media:[{kind}],observedViaSource:'first'};
 sqlite.prepare('INSERT INTO posts VALUES (?,?)').run(post.id,JSON.stringify(post));
 return post;
}
test('pagination crosses equal dates without omission in both directions',async()=>{
 const {sqlite,DB}=testDatabase();
 try {
 for(let i=100;i<220;i++)add(sqlite,i,i<170?'2026-09-01T00:00:00.000Z':'2026-09-02T00:00:00.000Z');
 for(const sort of ['newest','oldest']){
 const params=new URLSearchParams({sort});const ids=[];let page;
 do{page=await readFeed(DB,params);assert.equal(page.total,120);assert.ok(page.posts.length<=48);ids.push(...page.posts.map(p=>p.id));if(page.nextCursor)params.set('cursor',page.nextCursor);}while(page.nextCursor);
 assert.equal(ids.length,120);assert.equal(new Set(ids).size,120);assert.equal(ids[0],sort==='newest'?'x:170':'x:100');
 }
 }finally{sqlite.close();}
});
test('KST month bounds and discovery source apply to whole dataset',async()=>{
 const {sqlite,DB}=testDatabase();try{
 add(sqlite,1,'2026-08-31T14:59:59.999Z');add(sqlite,2,'2026-08-31T15:00:00.000Z','gif');add(sqlite,3,'2026-09-30T14:59:59.999Z');add(sqlite,4,'2026-09-30T15:00:00.000Z');
 sqlite.prepare('INSERT INTO discoveries VALUES (?,?)').run('x:2','second');
 assert.deepEqual((await readFeed(DB,new URLSearchParams({month:'2026-09'}))).posts.map(p=>p.id),['x:3','x:2']);
 const found=await readFeed(DB,new URLSearchParams({month:'2026-09',media:'video',source:'second'}));assert.equal(found.total,1);assert.equal(found.posts[0].id,'x:2');
 assert.equal((await readFeed(DB,new URLSearchParams({month:'2025-01'}))).total,0);
 }finally{sqlite.close();}
});
test('malformed query maps to 400 and cursor cannot change filter scope',async()=>{
 const {sqlite,DB}=testDatabase();try{
 for(let i=100;i<150;i++)add(sqlite,i,'2026-09-01T00:00:00.000Z');
 const page=await readFeed(DB,new URLSearchParams());
 for(const query of [new URLSearchParams({cursor:page.nextCursor,date:'2026-09-01'}).toString(),'month=2026-13','sort=bad','cursor=invalid',new URLSearchParams({cursor:page.nextCursor,media:'image'}).toString()]){
 const response=await handleApi(new Request('https://example.com/api/feed?'+query),{DB});assert.equal(response.status,400);
 }
 }finally{sqlite.close();}
});

test('duplicate source links exclude hidden, pending and missing posts but keep approved duplicates',async()=>{
 const {sqlite,DB}=testDatabase();try{
  for(const [id,reason] of [['1',null],['2',null],['3',null],['4','review'],['5',null],['6','review']]){
   sqlite.prepare('INSERT INTO posts VALUES (?,?)').run('x:'+id,JSON.stringify({id:'x:'+id,publishedAt:'2026-09-01',canonicalUrl:'https://x.com/source/status/'+id,authorHandle:'source'+id,moderationReason:reason,media:[{kind:'image',previewUrl:'photo'+id}]}));
   sqlite.prepare('INSERT INTO x_fingerprints(url,hash) VALUES(?,?)').run('photo'+id,'same');
  }
  sqlite.exec("INSERT INTO x_quality(post_id,decision,availability) VALUES('x:3','hidden','unknown'),('x:5','auto','missing'),('x:6','visible','unknown')");
  for(const [code,status] of [['kept1','kept'],['held1','held'],['pending1','pending'],['excluded1','excluded']]){
   sqlite.prepare('INSERT INTO instagram_review(code,data,status,imported_at) VALUES(?,?,?,?)').run(code,JSON.stringify({url:'https://www.instagram.com/p/'+code+'/',author:code,images:['image'+code]}),status,'2026-09-01');
   sqlite.prepare('INSERT INTO x_fingerprints(url,hash) VALUES(?,?)').run('image'+code,'same');
  }
  const result=await readFeed(DB,new URLSearchParams());
  assert.equal(result.total,1);
  assert.deepEqual(result.posts[0].duplicateSources.map(s=>s.author).sort(),['kept1','source2','source6']);
 }finally{sqlite.close();}
});
