import test from 'node:test';import assert from 'node:assert/strict';import {testDatabase} from './helpers/d1.mjs';import {readFeed} from '../src/feed.mjs';
test('YouTube tab excludes regular video tab and pages identical dates without duplicates',async()=>{const {DB,sqlite}=testDatabase();try{
 for(let n=0;n<49;n++){const id=String(n).padStart(11,'0');sqlite.prepare("INSERT INTO youtube_videos(video_id,metadata_json,metadata_fetched_at,decision,category,format) VALUES(?,?,unixepoch(),'kept','fancam','regular')").run(id,JSON.stringify({title:'서연',channelTitle:'채널',publishedAt:'2026-09-20T00:00:00.000Z',durationSeconds:180}));}
 const first=await readFeed(DB,new URLSearchParams('media=youtube'));assert.equal(first.posts.length,48);assert.equal(first.total,49);const second=await readFeed(DB,new URLSearchParams({media:'youtube',cursor:first.nextCursor}));assert.equal(second.posts.length,1);assert.equal(new Set([...first.posts,...second.posts].map(p=>p.id)).size,49);
 assert.equal((await readFeed(DB,new URLSearchParams('media=video'))).total,0);
 }finally{sqlite.close();}});
