import test from 'node:test';
import assert from 'node:assert/strict';
import {testDatabase} from './helpers/d1.mjs';
import {readFeed} from '../src/feed.mjs';

// The adapter records executed statements while still executing production SQL.
function traced(DB){
 const sql=[];
 return {sql,DB:{prepare:DB.prepare.bind(DB),async batch(statements){sql.push(...statements.map(s=>s.sql));return DB.batch(statements);}}};
}

test('Instagram and YouTube pages preserve empty duplicate sources without executing an unrelated X duplicate query',async t=>{
 const {sqlite,DB}=testDatabase();t.after(()=>sqlite.close());
 sqlite.prepare("INSERT INTO instagram_review(code,data,status,imported_at) VALUES('insta1',?,'kept','2026-09-22T00:00:00Z')").run(JSON.stringify({author:'photo',publishedAt:'2026-09-22T00:00:00Z',images:['https://s.cdninstagram.com/fixture.jpg'],media:[{kind:'image'}]}));
 sqlite.prepare("INSERT INTO youtube_videos(video_id,metadata_json,metadata_fetched_at,decision,format,category) VALUES('12345678901',?,?,'kept','regular','fancam')").run(JSON.stringify({title:'video',channelTitle:'channel',publishedAt:'2026-09-22T00:00:00Z'}),Math.floor(Date.now()/1000));
 for(const params of [{media:'image',platform:'instagram'},{media:'youtube'}]){
  const trace=traced(DB),result=await readFeed(trace.DB,new URLSearchParams(params));
  assert.equal(result.total,1);assert.equal(result.posts.length,1);assert.deepEqual(result.posts[0].duplicateSources,[]);
  assert.equal(trace.sql.some(sql=>sql.includes('WITH photos')),false,'no X rows on page can receive an X duplicate source');
 }
});

test('manual-only page preserves its author choices and omits unrelated X duplicate lookup',async t=>{
 const {sqlite,DB}=testDatabase();t.after(()=>sqlite.close());
 const post={id:'manual:x:99',platform:'x',manual:true,authorHandle:'writer',observedViaSource:'manual',publishedAt:'2026-09-22T00:00:00Z',media:[{kind:'image',previewUrl:'https://pbs.twimg.com/media/manual.jpg'}]};
 sqlite.prepare('INSERT INTO manual_posts(id,canonical_url,data,created_at) VALUES(?,?,?,?)').run(post.id,'https://x.com/writer/status/99',JSON.stringify(post),post.publishedAt);
 const trace=traced(DB),result=await readFeed(trace.DB,new URLSearchParams({media:'image',platform:'x'}));
 assert.equal(result.total,1);assert.equal(result.nextCursor,null);assert.deepEqual(result.posts,[{...post,duplicateSources:[]}]);
 assert.deepEqual(result.authors,[{platform:'x',handle:'writer',value:'x:writer'}]);
 assert.equal(trace.sql.some(sql=>sql.includes('WITH photos')),false);
});
