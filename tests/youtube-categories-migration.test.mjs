import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {testDatabase} from './helpers/d1.mjs';
test('category migration preserves videos, discovery references, audit and feed views',()=>{
 const {sqlite}=testDatabase({beforeYouTubeCategories:true});try{
 sqlite.exec("INSERT INTO youtube_videos(video_id,decision,category,format,revision,manual,metadata_json,metadata_fetched_at) VALUES('AbCdEf123_-','excluded','fancam','regular',4,1,'{}',unixepoch());INSERT INTO youtube_discoveries VALUES('AbCdEf123_-','search:ko-fancam',1,2)");
 const before=sqlite.prepare('SELECT * FROM youtube_videos').all(),discoveries=sqlite.prepare('SELECT * FROM youtube_discoveries').all();
 sqlite.exec('BEGIN');sqlite.exec(readFileSync(new URL('../migrations/0025_youtube_categories.sql',import.meta.url),'utf8'));assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(),[]);sqlite.exec('COMMIT');
 assert.deepEqual(sqlite.prepare('SELECT * FROM youtube_videos').all(),before);assert.deepEqual(sqlite.prepare('SELECT * FROM youtube_discoveries').all(),discoveries);
 assert.equal(sqlite.prepare('SELECT count(*) n FROM youtube_feed_posts').get().n,0);sqlite.prepare('SELECT count(*) FROM managed_feed_posts').get();sqlite.prepare('SELECT count(*) FROM combined_review_audit').get();
 for(const category of ['cosmo_live','official','other'])sqlite.prepare('UPDATE youtube_videos SET category=?').run(category);
 assert.throws(()=>sqlite.prepare('UPDATE youtube_videos SET category=?').run('invalid'),/CHECK/);
 }finally{sqlite.close();}
});
