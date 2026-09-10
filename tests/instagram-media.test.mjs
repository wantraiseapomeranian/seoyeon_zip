import test from 'node:test';
import assert from 'node:assert/strict';
import {testDatabase} from './helpers/d1.mjs';
import {handleInstagramReview} from '../src/instagram-review.mjs';
import {readFeed} from '../src/feed.mjs';
const image='https://scontent.cdninstagram.com/reel.jpg';
const request=(path,body)=>new Request('https://example.test/api/admin/instagram'+path,{method:body?'POST':'GET',headers:{origin:'https://example.test','content-type':'application/json','x-review-action':'review'},...(body?{body:JSON.stringify(body)}:{})});
test('reels and mixed media survive reimport and only approved items enter video feed',async()=>{
 const {sqlite,DB}=testDatabase();try{
 const reel={shortCode:'Reel_123',type:'Video',productType:'clips',displayUrl:image,timestamp:'2026-08-31T15:00:00Z',ownerUsername:'official'};
 const mixed={shortCode:'Mixed_123',type:'Sidecar',timestamp:reel.timestamp,childPosts:[{type:'Image',displayUrl:image+'?1'},{type:'Video',displayUrl:image+'?2'}]};
 await handleInstagramReview(request('/import',[reel,mixed]),{DB});
 assert.equal((await readFeed(DB,new URLSearchParams({media:'video'}))).total,0);
 for(const code of ['Reel_123','Mixed_123'])await handleInstagramReview(request('/'+code,{status:'kept',revision:0}),{DB});
 let feed=await readFeed(DB,new URLSearchParams({media:'video'}));assert.equal(feed.total,2);
 assert.equal(feed.posts.find(p=>p.id==='ig:Reel_123').canonicalUrl,'https://www.instagram.com/reel/Reel_123/');
 assert.equal((await readFeed(DB,new URLSearchParams({media:'image'}))).total,1);
 await handleInstagramReview(request('/import',[{shortCode:reel.shortCode,displayUrl:image}]),{DB});
 feed=await readFeed(DB,new URLSearchParams({media:'video'}));assert.equal(feed.total,2);
 await handleInstagramReview(request('/import',[{shortCode:reel.shortCode,displayUrl:image+'?renewed'}]),{DB});
 assert.equal((await readFeed(DB,new URLSearchParams({media:'video'}))).total,2);
 await handleInstagramReview(request('/import',[{...mixed,childPosts:[{type:'Image',displayUrl:image+'?new1'},{displayUrl:image+'?new2'}]}]),{DB});
 assert.equal((await readFeed(DB,new URLSearchParams({media:'video'}))).total,2);
 const filtered=await (await handleInstagramReview(request('?status=all&month=2026-09&media=video&author=official'),{DB})).json();assert.equal(filtered.items.length,1);assert.equal(filtered.counts.kept,1);
 assert.equal((await handleInstagramReview(request('?month=2026-13'),{DB})).status,400);
 }finally{sqlite.close();}
});
test('concurrent metadata imports conflict rather than misalign media',async()=>{
 const {sqlite,DB}=testDatabase();try{
 await handleInstagramReview(request('/import',[{shortCode:'Race_123',type:'Image',displayUrl:image}]),{DB});
 const wrapped={...DB,async batch(statements){sqlite.prepare("UPDATE instagram_review SET data=json_set(data,'$.caption','newer') WHERE code='Race_123'").run();return DB.batch(statements);}};
 const response=await handleInstagramReview(request('/import',[{shortCode:'Race_123',displayUrl:image}]),{DB:wrapped});assert.equal(response.status,409);
 assert.equal(JSON.parse(sqlite.prepare("SELECT data FROM instagram_review WHERE code='Race_123'").get().data).caption,'newer');
 }finally{sqlite.close();}
});
test('unknown thumbnails are not photos and a video thumbnail is not deduplicated as a photo',async()=>{
 const {sqlite,DB}=testDatabase();try{
 await handleInstagramReview(request('/import',[{shortCode:'Unknown_1',displayUrl:image},{shortCode:'A_video1',type:'Video',displayUrl:image},{shortCode:'Z_photo1',type:'Image',displayUrl:image}]),{DB});
 sqlite.exec("UPDATE instagram_review SET status='kept'");
 sqlite.prepare('INSERT INTO x_fingerprints(url,hash) VALUES(?,?)').run(image,'same');
 const videos=await readFeed(DB,new URLSearchParams({media:'video'}));assert.equal(videos.total,1);
 assert.equal((await readFeed(DB,new URLSearchParams({media:'image'}))).total,0); // legacy unknown keeps existing representative order
 const unknown=await (await handleInstagramReview(request('?status=all&media=unknown'),{DB})).json();assert.equal(unknown.items.length,1);
 sqlite.prepare("UPDATE instagram_review SET status='excluded' WHERE code='Unknown_1'").run();
 assert.equal((await readFeed(DB,new URLSearchParams({media:'image'}))).total,1);
 }finally{sqlite.close();}
});
