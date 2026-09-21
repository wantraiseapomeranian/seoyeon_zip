import test from 'node:test';import assert from 'node:assert/strict';
import {testDatabase} from './helpers/d1.mjs';
import {saveVideoStatement} from '../src/youtube-store.mjs';
test('metadata refresh preserves review, deduplicates and only regular kept videos enter feed',async()=>{
 const {DB,sqlite}=testDatabase();try{
 const v={videoId:'AbCdEf123_-',title:'서연',channelTitle:'채널',publishedAt:new Date().toISOString(),canonicalUrl:'https://www.youtube.com/watch?v=AbCdEf123_-',durationSeconds:190};
 await saveVideoStatement(DB,v).run();assert.equal((await DB.prepare('SELECT count(*) n FROM youtube_feed_posts').first()).n,0);
 sqlite.exec("UPDATE youtube_videos SET decision='kept',format='regular',category='fancam',revision=2");
 await saveVideoStatement(DB,{...v,title:'새 제목'}).run();const row=await DB.prepare('SELECT * FROM youtube_videos').first();assert.equal(row.revision,2);assert.equal(row.decision,'kept');assert.equal((await DB.prepare('SELECT count(*) n FROM youtube_videos').first()).n,1);assert.equal((await DB.prepare('SELECT count(*) n FROM youtube_feed_posts').first()).n,1);
 sqlite.exec("UPDATE youtube_videos SET metadata_fetched_at=0");assert.equal((await DB.prepare('SELECT count(*) n FROM youtube_feed_posts').first()).n,0);
 }finally{sqlite.close();}
});
