import test from 'node:test';
import assert from 'node:assert/strict';
import {testDatabase} from './helpers/d1.mjs';
import {youtubeExclusionReason} from '../src/youtube-relevance.mjs';
import {parseYouTubeUrl} from '../src/youtube-provider.mjs';
import {registerYouTube,reviewYouTube} from '../src/youtube-management.mjs';
import {collectYouTube} from '../src/youtube-collection.mjs';
import {readFileSync} from 'node:fs';
const id='Short123456',actor={id:'owner@test'};
const video={id,snippet:{title:'윤서연 인터뷰 #Shorts',channelId:'UCtest',channelTitle:'방송',publishedAt:'2026-09-20T00:00:00Z'},contentDetails:{duration:'PT20S'},status:{privacyStatus:'public',uploadStatus:'processed'}};
test('named appearances and shorts from unregistered channels reach review',()=>{
 for(const title of ['윤서연 인터뷰','윤서연 브이로그','tripleS SEOYEON 방송','윤서연 #Shorts','서연 COSMO 라이브'])assert.equal(youtubeExclusionReason({title,durationSeconds:20}),null,title);
 assert.equal(youtubeExclusionReason({title:'린 직캠 #윤서연',durationSeconds:180}),'SUBJECT_UNCLEAR');
});
test('shorts URLs accept only a complete video ID on trusted YouTube hosts',()=>{
 assert.deepEqual(parseYouTubeUrl(`https://www.youtube.com/shorts/${id}?si=share`),{videoId:id,canonicalUrl:`https://www.youtube.com/watch?v=${id}`});
 for(const url of [`https://evil.test/shorts/${id}`,`https://youtube.com/shorts/${id}/extra`])assert.throws(()=>parseYouTubeUrl(url));
});
test('shorts discovery stays pending and review publishes only a confirmed format',async()=>{
 const {DB,sqlite}=testDatabase(),env={DB,YOUTUBE_ENABLED:'true',YOUTUBE_COLLECTION_ENABLED:'true',YOUTUBE_API_KEY:'test'};
 try{
 const r=await collectYouTube(env,{fetcher:async url=>Response.json(new URL(url).pathname.endsWith('/search')?{items:[{id:{videoId:id}}]}:{items:[video]})});
 assert.equal(r.filtered,0);assert.equal(sqlite.prepare('SELECT decision FROM youtube_videos').get().decision,'pending');
 assert.equal(sqlite.prepare('SELECT count(*) n FROM youtube_feed_posts').get().n,0);
 const input={revision:0,decision:'kept',category:'appearance',format:'unknown',reasonCode:'SEOYEON_CONFIRMED',requestId:crypto.randomUUID()};
 await assert.rejects(reviewYouTube(env,id,input,actor),/invalid_input/);
 await reviewYouTube(env,id,{...input,format:'shorts'},actor);
 assert.equal(sqlite.prepare('SELECT count(*) n FROM youtube_feed_posts').get().n,1);
 assert.equal(JSON.parse(sqlite.prepare('SELECT new_state FROM youtube_review_events').get().new_state).format,'shorts');
 }finally{sqlite.close();}
});
test('manual shorts registration requires appearance confirmation and records its format',async()=>{
 const {DB,sqlite}=testDatabase(),env={DB,YOUTUBE_ENABLED:'true',YOUTUBE_API_KEY:'test'};
 try{
 const input={url:`https://youtube.com/shorts/${id}`,category:'appearance',format:'shorts',confirmedAppearance:true,requestId:crypto.randomUUID()};
 const options={fetcher:async()=>Response.json({items:[video]})};
 await assert.rejects(registerYouTube(env,{...input,confirmedAppearance:false},actor,options),/invalid_input/);
 const result=await registerYouTube(env,input,actor,options);assert.equal(result.saved,true);
 assert.deepEqual(await registerYouTube(env,input,actor,options),result);
 await assert.rejects(registerYouTube(env,{...input,format:'regular'},actor,options),/review_conflict/);
 assert.equal(sqlite.prepare('SELECT format FROM youtube_videos').get().format,'shorts');
 assert.equal(sqlite.prepare('SELECT count(*) n FROM youtube_feed_posts').get().n,1);
 }finally{sqlite.close();}
});

test('scope migration preserves videos, discoveries and audit while invalidating only current search leases',async()=>{
 const {DB,sqlite}=testDatabase({beforeYouTubeScope:true});
 try{
 await registerYouTube({DB,YOUTUBE_ENABLED:'true',YOUTUBE_API_KEY:'test'},{url:`https://youtu.be/${id}`,category:'appearance',confirmedRegular:true,requestId:crypto.randomUUID()},actor,{fetcher:async()=>Response.json({items:[video]})});
 sqlite.exec(`INSERT INTO youtube_discoveries VALUES('${id}','search:ko-fancam',1,2); UPDATE youtube_sources SET page_token='old',lease_token='active',lease_until=9999999999,window_start='2026-09-01',enabled=0 WHERE source_key='search:ko-fancam'; INSERT INTO youtube_sources(source_key,kind,query,enabled,backfill_handle) VALUES('backfill:test','search','윤서연',0,'@test');`);
 const videos=sqlite.prepare('SELECT * FROM youtube_videos').all(),discoveries=sqlite.prepare('SELECT * FROM youtube_discoveries').all(),audit=sqlite.prepare('SELECT * FROM youtube_review_events').all(),historical=sqlite.prepare("SELECT * FROM youtube_sources WHERE source_key='backfill:test'").get();
 sqlite.exec('BEGIN');sqlite.exec(readFileSync(new URL('../migrations/0029_youtube_appearance_scope.sql',import.meta.url),'utf8'));assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(),[]);sqlite.exec('COMMIT');
 assert.deepEqual(sqlite.prepare('SELECT * FROM youtube_videos').all(),videos);assert.deepEqual(sqlite.prepare('SELECT * FROM youtube_discoveries').all(),discoveries);assert.deepEqual(sqlite.prepare('SELECT * FROM youtube_review_events').all(),audit);assert.deepEqual(sqlite.prepare("SELECT * FROM youtube_sources WHERE source_key='backfill:test'").get(),historical);
 const source=sqlite.prepare("SELECT * FROM youtube_sources WHERE source_key='search:ko-fancam'").get();assert.equal(source.query,'윤서연');assert.equal(source.enabled,0);assert.equal(source.page_token,null);assert.equal(source.lease_token,null);assert.equal(source.window_start,null);assert.equal(source.revision,1);
 sqlite.exec("UPDATE youtube_videos SET format='shorts'");assert.equal(sqlite.prepare('SELECT count(*) n FROM youtube_feed_posts').get().n,1);
 assert.throws(()=>sqlite.exec("UPDATE youtube_videos SET format='unknown'"),/CHECK/);
 }finally{sqlite.close();}
});
