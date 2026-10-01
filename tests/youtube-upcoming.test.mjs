import test from 'node:test';
import assert from 'node:assert/strict';
import {testDatabase} from './helpers/d1.mjs';
import {fetchYouTubeVideos} from '../src/youtube-provider.mjs';
import {collectYouTube,refreshYouTube} from '../src/youtube-collection.mjs';
import {previewYouTube,registerYouTube} from '../src/youtube-management.mjs';
const upcoming='Upcoming123',normal='Normal12345';
const video=(id,duration='PT3M',live='none')=>({id,snippet:{title:'윤서연 직캠',channelTitle:'채널',channelId:'UC123',publishedAt:'2026-09-20T00:00:00Z',liveBroadcastContent:live},contentDetails:{duration},status:{privacyStatus:'public',uploadStatus:'processed'}});
const environment=DB=>({DB,YOUTUBE_ENABLED:'true',YOUTUBE_COLLECTION_ENABLED:'true',YOUTUBE_API_KEY:'test'});
const mixed=async url=>Response.json(new URL(url).pathname.endsWith('/search')?{items:[upcoming,normal].map(videoId=>({id:{videoId}})),nextPageToken:'next-page'}:{items:[video(upcoming,'P0D','upcoming'),video(normal)]});

test('scheduled, live and zero-duration metadata do not poison a mixed page',async()=>{
 for(const [duration,live] of [['P0D','upcoming'],[undefined,'upcoming'],['PT3M','upcoming'],['PT0S','none'],['P0D','none'],['PT3M','live']]){
  const scheduled=video(upcoming,duration,live);if(duration===undefined)delete scheduled.contentDetails.duration;
  const result=await fetchYouTubeVideos({YOUTUBE_API_KEY:'test'},[upcoming,normal],{fetcher:async()=>Response.json({items:[scheduled,video(normal)]})});
  assert.equal(result.videos[0].deferred,true);assert.equal(result.videos[1].durationSeconds,180);assert.deepEqual(result.unavailableIds,[]);
 }
});
test('duration accepts day-only ISO values but rejects malformed or unbounded durations',async()=>{
 const fetchDuration=value=>fetchYouTubeVideos({YOUTUBE_API_KEY:'test'},[normal],{fetcher:async()=>Response.json({items:[video(normal,value)]})});
 assert.equal((await fetchDuration('P1D')).videos[0].durationSeconds,86400);
 for(const value of ['P','PT','P1DT','bad','PT'+'9'.repeat(400)+'S'])await assert.rejects(fetchDuration(value),/invalid_response/);
});
test('collector commits deferred IDs and normal videos together before advancing, then refreshes without search',async()=>{
 const {DB,sqlite}=testDatabase(),env=environment(DB),now=Math.floor(Date.now()/1000);
 try{
  assert.equal((await collectYouTube(env,{now,fetcher:mixed})).status,'partial');
  let row=sqlite.prepare('SELECT * FROM youtube_videos WHERE video_id=?').get(upcoming);
  assert.equal(row.availability,'unavailable');assert.equal(row.decision,'pending');assert.equal(JSON.parse(row.metadata_json).deferred,true);
  assert.equal(sqlite.prepare('SELECT availability FROM youtube_videos WHERE video_id=?').get(normal).availability,'available');
  assert.equal(sqlite.prepare('SELECT count(*) n FROM youtube_discoveries').get().n,2);
  assert.equal(sqlite.prepare("SELECT count(*) n FROM youtube_sources WHERE page_token='next-page'").get().n,1);
  // An existing human decision must survive both deferral and recovery.
  sqlite.prepare("UPDATE youtube_videos SET decision='kept',category='fancam',format='regular',revision=7 WHERE video_id=?").run(upcoming);
  assert.equal(sqlite.prepare('SELECT count(*) n FROM youtube_feed_posts').get().n,0);
  const calls=[];const fetcher=async url=>{const u=new URL(url);calls.push(u.pathname);assert.equal(u.searchParams.get('id'),upcoming);return Response.json({items:[video(upcoming)]});};
  await refreshYouTube(env,{now:now+3599,fetcher});assert.deepEqual(calls,[]);
  sqlite.exec('UPDATE youtube_control SET refresh_due_at=0');
  await refreshYouTube(env,{now:now+3600,fetcher});assert.deepEqual(calls,['/youtube/v3/videos']);
  row=sqlite.prepare('SELECT * FROM youtube_videos WHERE video_id=?').get(upcoming);
  assert.equal(row.availability,'available');assert.equal(row.decision,'kept');assert.equal(row.revision,7);assert.equal(JSON.parse(row.metadata_json).deferred,undefined);
  assert.equal(sqlite.prepare('SELECT count(*) n FROM youtube_feed_posts').get().n,1);
 }finally{sqlite.close();}
});
test('failed deferred save rolls back the complete page and keeps its cursor',async()=>{
 const {DB,sqlite}=testDatabase();try{
  sqlite.exec("CREATE TRIGGER fail_deferred BEFORE INSERT ON youtube_videos WHEN NEW.video_id='Upcoming123' BEGIN SELECT RAISE(ABORT,'fail'); END");
  assert.equal((await collectYouTube(environment(DB),{fetcher:mixed})).status,'failed');
  assert.equal(sqlite.prepare('SELECT count(*) n FROM youtube_videos').get().n,0);assert.equal(sqlite.prepare('SELECT count(*) n FROM youtube_discoveries').get().n,0);
  assert.equal(sqlite.prepare('SELECT count(*) n FROM youtube_sources WHERE page_token IS NOT NULL').get().n,0);
 }finally{sqlite.close();}
});
test('a malformed source waits twelve hours without blocking other sources or burning more searches',async()=>{
 const {DB,sqlite}=testDatabase(),env=environment(DB),now=Math.floor(Date.now()/1000);let searches=0;
 try{
  sqlite.exec("UPDATE youtube_sources SET enabled=CASE WHEN source_key='search:en-fancam' THEN 1 ELSE 0 END,page_token='saved-page'");
  const fetcher=async()=>{searches++;return Response.json({items:[{id:{videoId:'bad'}}]});};
  assert.equal((await collectYouTube(env,{now,fetcher})).error,'invalid_response');
  const row=sqlite.prepare("SELECT * FROM youtube_sources WHERE source_key='search:en-fancam'").get();assert.equal(row.page_token,'saved-page');assert.equal(row.next_due_at,now+43200);
  assert.equal(sqlite.prepare('SELECT blocked_until FROM youtube_control').get().blocked_until,0);
  for(const offset of [300,600,3600,43199])assert.equal((await collectYouTube(env,{now:now+offset,fetcher})).status,'idle');
  assert.equal(searches,1);
  sqlite.exec("UPDATE youtube_sources SET enabled=1,page_token=NULL WHERE source_key='search:ko-fancam'");
  assert.equal((await collectYouTube(env,{now:now+300,fetcher:async()=>Response.json({items:[]})})).status,'ok');
  assert.equal((await collectYouTube(env,{now:now+43200,fetcher})).error,'invalid_response');assert.equal(searches,2);
 }finally{sqlite.close();}
});
test('manual preview and registration cannot publish deferred videos',async()=>{
 const {DB,sqlite}=testDatabase(),env=environment(DB),options={fetcher:async()=>Response.json({items:[video(upcoming,'PT3M','upcoming')]})};
 try{
  const input={url:'https://www.youtube.com/watch?v='+upcoming,category:'fancam',confirmedRegular:true,requestId:crypto.randomUUID()};
  for(const action of [()=>previewYouTube(env,input,options),()=>registerYouTube(env,input,{id:'owner'},options)])await assert.rejects(action,e=>e.message==='unavailable'&&e.status===422);
  assert.equal(sqlite.prepare('SELECT count(*) n FROM youtube_videos').get().n,0);
 }finally{sqlite.close();}
});

test('refresh keeps a still-scheduled human-reviewed video out of the feed and retries hourly',async()=>{
 const {DB,sqlite}=testDatabase(),env=environment(DB),now=Math.floor(Date.now()/1000);let calls=0;
 try{
  sqlite.prepare("INSERT INTO youtube_videos(video_id,metadata_json,metadata_fetched_at,decision,category,format,revision) VALUES(?,?,?,'kept','fancam','regular',9)").run(upcoming,JSON.stringify({title:'윤서연 직캠',durationSeconds:180}),now-604801);
  const fetcher=async()=>{calls++;return Response.json({items:[video(upcoming,'P0D','upcoming')]});};
  await refreshYouTube(env,{now,fetcher});
  const row=sqlite.prepare('SELECT * FROM youtube_videos').get();assert.equal(row.availability,'unavailable');assert.equal(row.decision,'kept');assert.equal(row.revision,9);
  assert.equal(sqlite.prepare('SELECT count(*) n FROM youtube_feed_posts').get().n,0);
  await refreshYouTube(env,{now:now+300,fetcher});assert.equal(calls,1);
  await refreshYouTube(env,{now:now+3600,fetcher});assert.equal(calls,2);
  assert.equal(sqlite.prepare('SELECT metadata_fetched_at FROM youtube_videos').get().metadata_fetched_at,now+3600);
 }finally{sqlite.close();}
});
test('deferral does not bypass title scope filters',async()=>{
 const {DB,sqlite}=testDatabase();try{
  const candidate=video(upcoming,'P0D','upcoming');candidate.snippet.title='tripleS lyrics line distribution';
  const result=await collectYouTube(environment(DB),{fetcher:async url=>Response.json(new URL(url).pathname.endsWith('/search')?{items:[{id:{videoId:upcoming}}]}:{items:[candidate]})});
  assert.equal(result.status,'ok');assert.equal(result.filtered,1);assert.equal(sqlite.prepare('SELECT count(*) n FROM youtube_videos').get().n,0);
 }finally{sqlite.close();}
});
