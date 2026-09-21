import test from 'node:test';import assert from 'node:assert/strict';import {testDatabase} from './helpers/d1.mjs';
import {registerYouTube,reviewYouTube,handleYouTube} from '../src/youtube-management.mjs';
import worker from '../src/worker.mjs';
const id='AbCdEf123_-',actor={id:'owner@test.local'},url=`https://youtu.be/${id}`;
const fetcher=async()=>Response.json({items:[{id,snippet:{title:'서연',channelId:'UC123',channelTitle:'채널',publishedAt:'2026-09-20T00:00:00Z'},contentDetails:{duration:'PT3M'},status:{privacyStatus:'public',uploadStatus:'processed'}}]});
test('registration is idempotent, preserves exclusion and audits changes atomically',async()=>{
 const {DB,sqlite}=testDatabase(),env={DB,YOUTUBE_ENABLED:'true',YOUTUBE_API_KEY:'test'};
 try{const input={url,category:'fancam',confirmedRegular:true,requestId:crypto.randomUUID()};const r=await registerYouTube(env,input,actor,{fetcher});assert.equal(r.saved,true);
 assert.deepEqual(await registerYouTube(env,input,actor,{fetcher}),r);
 await assert.rejects(registerYouTube(env,{...input,category:'appearance'},actor,{fetcher}),/review_conflict/);
 await reviewYouTube(env,id,{revision:1,decision:'excluded',category:'fancam',format:'regular',reasonCode:'NOT_SEOYEON',requestId:crypto.randomUUID()},actor);
 const dup=await registerYouTube(env,{...input,requestId:crypto.randomUUID()},actor,{fetcher});assert.equal(dup.existing,true);assert.equal(dup.decision,'excluded');
 await assert.rejects(reviewYouTube(env,id,{revision:1,decision:'kept',category:'fancam',format:'regular',reasonCode:'SEOYEON_CONFIRMED',requestId:crypto.randomUUID()},actor),/review_conflict/);
 sqlite.exec("CREATE TRIGGER fail_yt BEFORE INSERT ON youtube_review_events BEGIN SELECT RAISE(ABORT,'fail'); END");
 await assert.rejects(reviewYouTube(env,id,{revision:2,decision:'held',category:'fancam',format:'regular',reasonCode:'NEEDS_REVIEW',requestId:crypto.randomUUID()},actor));
 assert.equal(sqlite.prepare('SELECT decision FROM youtube_videos').get().decision,'excluded');
 }finally{sqlite.close();}
});
test('owner, same origin, confirmation and formats are required',async()=>{
 const {DB,sqlite}=testDatabase(),env={DB,YOUTUBE_ENABLED:'true',YOUTUBE_API_KEY:'test'};
 try{
 await assert.rejects(registerYouTube(env,{url},actor,{fetcher}),/invalid_input/);
 const req=new Request('https://test.local/api/youtube/posts',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
 assert.equal((await handleYouTube(req,env,{actor})).status,403);
 assert.equal((await handleYouTube(new Request('https://test.local/api/youtube/review'),env,{})).status,401);
 const response=await worker.fetch(new Request('https://test.local/api/youtube/review'),{...env,TEAM_DOMAIN:'https://team.cloudflareaccess.com',POLICY_AUD:'aud',OWNER_EMAIL:actor.id},{});assert.equal(response.status,401);
 }finally{sqlite.close();}
});
