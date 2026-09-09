import test from 'node:test';
import assert from 'node:assert/strict';
import { readFeed } from '../src/feed.mjs';
import { handleApi } from '../src/worker.mjs';
import { testDatabase } from './helpers/d1.mjs';
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
 for(const query of ['month=2026-13','sort=bad','cursor=invalid',new URLSearchParams({cursor:page.nextCursor,media:'image'}).toString()]){
 const response=await handleApi(new Request('https://example.com/api/feed?'+query),{DB});assert.equal(response.status,400);
 }
 }finally{sqlite.close();}
});
