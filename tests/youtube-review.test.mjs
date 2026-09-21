import test from 'node:test';import assert from 'node:assert/strict';import {testDatabase} from './helpers/d1.mjs';import {reviewYouTube} from '../src/youtube-management.mjs';import {handleReviewAudit} from '../src/review-audit-api.mjs';
test('review rejects Shorts publication and YouTube events appear in filtered history',async()=>{const {DB,sqlite}=testDatabase(),env={DB,YOUTUBE_ENABLED:'true'},id='AbCdEf123_-',actor={id:'owner@test'};try{
 sqlite.prepare("INSERT INTO youtube_videos(video_id,metadata_json,metadata_fetched_at) VALUES(?,'{}',unixepoch())").run(id);
 const input={revision:0,decision:'kept',category:'fancam',format:'shorts',reasonCode:'SEOYEON_CONFIRMED',requestId:crypto.randomUUID()};await assert.rejects(reviewYouTube(env,id,input,actor),/invalid_input/);
 const saved=await reviewYouTube(env,id,{...input,format:'regular'},actor);const response=await handleReviewAudit(new Request('https://test/api/admin/review-audit?platform=YOUTUBE'),env,{actor});const data=await response.json();assert.equal(data.items.length,1);assert.equal(data.items[0].platform,'YOUTUBE');assert.equal(data.items[0].summary.url,'https://www.youtube.com/watch?v='+id);
 const detail=await (await handleReviewAudit(new Request('https://test/api/admin/review-audit/'+saved.auditId),env,{actor})).json();assert.equal(detail.item.newState.decision,'kept');assert.equal(detail.item.metadata.title,undefined);
 }finally{sqlite.close();}});

import {listYouTube} from '../src/youtube-management.mjs';
test('review exposes collection hints and records reversible scope exclusions without declaring Shorts',async()=>{const {DB,sqlite}=testDatabase();try{
 const env={DB,YOUTUBE_ENABLED:'true'},id='AbCdEf123_-';sqlite.prepare("INSERT INTO youtube_videos(video_id,metadata_json,metadata_fetched_at) VALUES(?,?,unixepoch())").run(id,JSON.stringify({title:'윤서연 직캠',durationSeconds:20}));
 const p=(await listYouTube(env,new URLSearchParams())).posts[0];assert.equal(p.collectionReason,'SHORT_CLIP');
 await reviewYouTube(env,id,{revision:0,decision:'excluded',category:null,format:'unknown',reasonCode:'COLLECTION_SCOPE',requestId:crypto.randomUUID()},{id:'owner@test'});
 assert.equal(sqlite.prepare('SELECT format FROM youtube_videos').get().format,'unknown');assert.equal(sqlite.prepare('SELECT reason_code FROM youtube_review_events').get().reason_code,'COLLECTION_SCOPE');
 await reviewYouTube(env,id,{revision:1,decision:'pending',category:null,format:'unknown',reasonCode:'NEEDS_REVIEW',requestId:crypto.randomUUID()},{id:'owner@test'});
 assert.equal(sqlite.prepare('SELECT decision FROM youtube_videos').get().decision,'pending');
 }finally{sqlite.close();}});
