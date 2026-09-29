import test from 'node:test';import assert from 'node:assert/strict';import {testDatabase} from './helpers/d1.mjs';import {readFeed} from '../src/feed.mjs';
test('YouTube tab excludes regular video tab and pages identical dates without duplicates',async()=>{const {DB,sqlite}=testDatabase();try{
 for(let n=0;n<49;n++){const id=String(n).padStart(11,'0');sqlite.prepare("INSERT INTO youtube_videos(video_id,metadata_json,metadata_fetched_at,decision,category,format) VALUES(?,?,unixepoch(),'kept','fancam','regular')").run(id,JSON.stringify({title:'서연',channelTitle:'채널',publishedAt:'2026-09-20T00:00:00.000Z',durationSeconds:180}));}
 const first=await readFeed(DB,new URLSearchParams('media=youtube'));assert.equal(first.posts.length,48);assert.equal(first.total,49);const second=await readFeed(DB,new URLSearchParams({media:'youtube',cursor:first.nextCursor}));assert.equal(second.posts.length,1);assert.equal(new Set([...first.posts,...second.posts].map(p=>p.id)).size,49);
 assert.equal((await readFeed(DB,new URLSearchParams('media=video'))).total,0);
 }finally{sqlite.close();}});

function video(sqlite,n,format,{decision='kept',date='2026-09-20T00:00:00.000Z',fresh=true,category='appearance'}={}){
 const id=String(n).padStart(11,'0');
 sqlite.prepare("INSERT INTO youtube_videos(video_id,metadata_json,metadata_fetched_at,decision,category,format) VALUES(?,?,?,?,?,?)").run(id,JSON.stringify({title:'fixture',channelTitle:'fixture',publishedAt:date,durationSeconds:format==='shorts'?200:30}),fresh?Math.floor(Date.now()/1000):0,decision,category,format);
 return 'yt:'+id;
}
test('YouTube format filters use reviewed classification, keep visibility and count all pages',async()=>{
 const {DB,sqlite}=testDatabase();try{
  for(let n=0;n<49;n++)video(sqlite,n,'shorts');
  const regular=video(sqlite,100,'regular');video(sqlite,101,'shorts',{decision:'pending'});video(sqlite,102,'shorts',{fresh:false});
  video(sqlite,103,'shorts',{date:'2026-09-19T14:59:59.999Z'});
  for(const sort of ['newest','oldest']){
   const params=new URLSearchParams({media:'youtube',youtubeFormat:'shorts',sort,date:'2026-09-20'}),first=await readFeed(DB,params);
   assert.equal(first.total,49);assert.equal(first.posts.length,48);assert.ok(first.nextCursor);
   params.set('cursor',first.nextCursor);const next=await readFeed(DB,params);
   assert.equal(next.total,49);assert.equal(next.posts.length,1);assert.equal(next.nextCursor,null);
   assert.equal(new Set([...first.posts,...next.posts].map(p=>p.id)).size,49);
   assert.ok(!first.posts.some(p=>p.id===regular));
   params.set('youtubeFormat','regular');await assert.rejects(readFeed(DB,params),{message:'invalid_feed_query',status:400});
   params.delete('youtubeFormat');await assert.rejects(readFeed(DB,params),{message:'invalid_feed_query',status:400});
  }
  const regularPage=await readFeed(DB,new URLSearchParams({media:'youtube',youtubeFormat:'regular'}));
  assert.equal(regularPage.total,1);assert.deepEqual(regularPage.posts.map(p=>p.id),[regular]);
  assert.equal((await readFeed(DB,new URLSearchParams('media=youtube'))).total,51);
  assert.equal((await readFeed(DB,new URLSearchParams('media=youtube&youtubeFormat=all'))).total,51);
  assert.equal((await readFeed(DB,new URLSearchParams('media=youtube&youtubeFormat=regular&date=2026-09-21'))).total,0);
 }finally{sqlite.close();}
});
test('YouTube format rejects invalid values and use outside YouTube',async()=>{
 const {DB,sqlite}=testDatabase();try{
  for(const query of ['media=youtube&youtubeFormat=bad','media=image&youtubeFormat=shorts','youtubeFormat=regular'])await assert.rejects(readFeed(DB,new URLSearchParams(query)),{message:'invalid_feed_query',status:400});
 }finally{sqlite.close();}
});

test('YouTube categories combine with format, visibility, totals and cursor scope',async()=>{
 const {DB,sqlite}=testDatabase();try{
  for(let n=0;n<49;n++)video(sqlite,n,'shorts',{category:'fancam'});
  video(sqlite,100,'regular',{category:'fancam'});
  const appearance=video(sqlite,101,'shorts'),cosmo=video(sqlite,102,'regular',{category:'cosmo_live'}),official=video(sqlite,103,'shorts',{category:'official'}),other=video(sqlite,104,'regular',{category:'other'});
  video(sqlite,105,'shorts',{category:'fancam',decision:'held'});video(sqlite,106,'shorts',{category:'fancam',fresh:false});
  const query=new URLSearchParams({media:'youtube',youtubeCategory:'fancam',youtubeFormat:'shorts'}),page=await readFeed(DB,query);
  assert.equal(page.total,49);assert.equal(page.posts.length,48);assert.ok(page.nextCursor);
  query.set('cursor',page.nextCursor);const next=await readFeed(DB,query);assert.equal(next.total,49);assert.equal(next.posts.length,1);assert.equal(new Set([...page.posts,...next.posts].map(p=>p.id)).size,49);
  for(const category of ['all','appearance']){query.set('youtubeCategory',category);await assert.rejects(readFeed(DB,query),{message:'invalid_feed_query',status:400});}
  assert.equal((await readFeed(DB,new URLSearchParams('media=youtube&youtubeCategory=fancam'))).total,50);
  for(const [category,id] of [['appearance',appearance],['cosmo_live',cosmo],['official',official],['other',other]])assert.deepEqual((await readFeed(DB,new URLSearchParams({media:'youtube',youtubeCategory:category}))).posts.map(p=>p.id),[id]);
  assert.equal((await readFeed(DB,new URLSearchParams('media=youtube&youtubeCategory=cosmo_live&youtubeFormat=shorts'))).total,0);
  assert.equal((await readFeed(DB,new URLSearchParams('media=youtube&youtubeCategory=all'))).total,54);
  for(const q of ['media=youtube&youtubeCategory=bad','media=image&youtubeCategory=fancam','youtubeCategory=official'])await assert.rejects(readFeed(DB,new URLSearchParams(q)),{message:'invalid_feed_query',status:400});
 }finally{sqlite.close();}
});
