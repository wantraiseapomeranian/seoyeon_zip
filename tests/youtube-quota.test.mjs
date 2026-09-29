import test from 'node:test';
import assert from 'node:assert/strict';
import {testDatabase} from './helpers/d1.mjs';
import {youtubeRequest} from '../src/youtube-provider.mjs';
import {collectYouTube,refreshYouTube} from '../src/youtube-collection.mjs';
import {readYouTubeOperations} from '../src/youtube-operations.mjs';
const setup=()=>{const db=testDatabase();return {...db,env:{DB:db.DB,YOUTUBE_ENABLED:'true',YOUTUBE_COLLECTION_ENABLED:'true',YOUTUBE_API_KEY:'fixture'}};};
const day=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const empty=async()=>Response.json({items:[]});

test('search allows calls 13 through 50 and rejects call 51 before sending it',async()=>{
 const {env,sqlite}=setup();let requests=0;
 try{sqlite.prepare("INSERT INTO youtube_api_budget VALUES(?,'search',12)").run(day());
  for(let i=0;i<38;i++)await youtubeRequest(env,'search',{}, {fetcher:async()=>{requests++;return empty();}});
  await assert.rejects(youtubeRequest(env,'search',{}, {fetcher:async()=>{requests++;return empty();}}),e=>e.message==='quota_exceeded'&&e.budgetBucket==='search');
  assert.equal(requests,38);assert.equal(sqlite.prepare("SELECT calls FROM youtube_api_budget WHERE bucket='search'").get().calls,50);
 }finally{sqlite.close();}
});

test('concurrent requests cannot overspend the final search allowance',async()=>{
 const {env,sqlite}=setup();let requests=0;
 try{sqlite.prepare("INSERT INTO youtube_api_budget VALUES(?,'search',49)").run(day());
  const results=await Promise.allSettled(Array.from({length:4},()=>youtubeRequest(env,'search',{}, {fetcher:async()=>{requests++;return empty();}})));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(requests,1);
  assert.equal(sqlite.prepare("SELECT calls FROM youtube_api_budget WHERE bucket='search'").get().calls,50);
 }finally{sqlite.close();}
});

test('exhausted searches leave cursors untouched while metadata and upload channels continue',async()=>{
 const {env,sqlite}=setup();const requests=[];
 try{sqlite.prepare("INSERT INTO youtube_api_budget VALUES(?,'search',50)").run(day());
  sqlite.exec("UPDATE youtube_sources SET page_token='keep-page',pages=2,window_start='2026-09-01',window_end='2026-09-28'; INSERT INTO youtube_videos(video_id,metadata_json,metadata_fetched_at) VALUES('Refresh1234','{}',unixepoch()-700000)");
  const before=sqlite.prepare('SELECT * FROM youtube_sources ORDER BY source_key').all();
  const fetcher=async url=>{requests.push(new URL(url).pathname.split('/').at(-1));return empty();};
  assert.equal((await collectYouTube(env,{fetcher})).status,'idle');
  assert.deepEqual(sqlite.prepare('SELECT * FROM youtube_sources ORDER BY source_key').all(),before);
  assert.equal((await refreshYouTube(env,{fetcher})).status,'ok');
  sqlite.exec("INSERT INTO youtube_sources(source_key,kind,query,playlist_id) VALUES('channel:test','channel','UCtest','UUtest')");
  assert.equal((await collectYouTube(env,{fetcher})).status,'ok');
  assert.deepEqual(requests,['videos','playlistItems']);assert.equal(sqlite.prepare('SELECT blocked_until FROM youtube_control').get().blocked_until,0);
 }finally{sqlite.close();}
});

test('search quota race waits until Pacific midnight without blocking metadata',async t=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2027-07-01T06:59:00Z')});
 const {env,sqlite,DB}=setup();const prepare=DB.prepare;let raced=false;
 try{DB.prepare=sql=>{const statement=prepare(sql);if(sql.startsWith('UPDATE youtube_sources SET lease_token=')){const first=statement.first;statement.first=async function(){const row=await first.call(this);if(row&&!raced){raced=true;sqlite.prepare("INSERT INTO youtube_api_budget VALUES(?,'search',50)").run(day());}return row;};}return statement;};
  let requests=0;const result=await collectYouTube(env,{fetcher:async()=>{requests++;return empty();}});
  assert.equal(result.status,'quota_wait');assert.equal(requests,0);
  const source=sqlite.prepare("SELECT * FROM youtube_sources WHERE last_error_code='quota_exceeded'").get();
  assert.equal(new Date(source.next_due_at*1000).toISOString(),'2027-07-01T07:00:00.000Z');assert.equal(source.page_token,null);assert.equal(source.lease_token,null);
  assert.equal(sqlite.prepare('SELECT blocked_until FROM youtube_control').get().blocked_until,0);
  assert.equal((await refreshYouTube(env,{fetcher:empty})).status,'ok');
 }finally{sqlite.close();}
});

for(const [at,reset] of [
 ['2027-07-01T06:59:00Z','2027-07-01T07:00:00Z'],
 ['2027-01-01T07:59:00Z','2027-01-01T08:00:00Z'],
 ['2027-03-14T08:00:00Z','2027-03-15T07:00:00Z'],
 ['2027-11-07T07:00:00Z','2027-11-08T08:00:00Z']
])test('provider quota resets at next Pacific midnight including DST: '+at,async t=>{
 t.mock.timers.enable({apis:['Date'],now:new Date(at)});const {env,sqlite}=setup();
 try{const result=await collectYouTube(env,{fetcher:async()=>Response.json({error:{errors:[{reason:'quotaExceeded'}]}},{status:403})});
  assert.equal(result.status,'failed');assert.equal(sqlite.prepare('SELECT blocked_until FROM youtube_control').get().blocked_until,Date.parse(reset)/1000);
 }finally{sqlite.close();}
});

test('search resumes the saved page at the budget date boundary',async t=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2027-07-01T06:59:00Z')});const {env,sqlite}=setup();
 try{sqlite.prepare("INSERT INTO youtube_api_budget VALUES(?,'search',50)").run(day());
  sqlite.exec("UPDATE youtube_sources SET enabled=0; UPDATE youtube_sources SET enabled=1,page_token='saved-page',pages=1,window_start='2027-06-01',window_end='2027-06-30' WHERE source_key='search:appearance'");
  assert.equal((await collectYouTube(env,{fetcher:empty})).status,'idle');
  t.mock.timers.setTime(Date.parse('2027-07-01T07:00:00Z'));
  assert.equal((await collectYouTube(env,{fetcher:async url=>{assert.equal(new URL(url).searchParams.get('pageToken'),'saved-page');return empty();}})).status,'ok');
  assert.equal(sqlite.prepare("SELECT calls FROM youtube_api_budget WHERE day='2027-07-01' AND bucket='search'").get().calls,1);
  assert.equal(sqlite.prepare("SELECT page_token FROM youtube_sources WHERE enabled=1").get().page_token,null);
 }finally{sqlite.close();}
});

test('operations reports 50-call wait and next reset without a failure alert',async t=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2027-07-01T06:59:00Z')});const {env,sqlite}=setup();
 try{sqlite.prepare("INSERT INTO youtube_api_budget VALUES(?,'search',50)").run(day());const info=await readYouTubeOperations(env,Date.now()/1000);
  assert.equal(info.search.limit,50);assert.equal(info.status,'quota_wait');
  assert.ok(info.sources.every(s=>s.status==='quota_wait'&&s.nextDueAt==='2027-07-01T07:00:00.000Z'));
 }finally{sqlite.close();}
});


test('legacy block release is conditional, idempotent, and preserves progress',async()=>{
 const {readFileSync}=await import('node:fs');const sql=readFileSync(new URL('../scripts/sql/resume-youtube-2026-09-29.sql',import.meta.url),'utf8');
 for(const change of ['',"UPDATE youtube_control SET blocked_until=1790661591","UPDATE youtube_control SET last_error_code='provider_access'","UPDATE youtube_control SET refresh_until=unixepoch()+60","UPDATE youtube_sources SET lease_until=unixepoch()+60","INSERT INTO youtube_api_budget VALUES('2026-09-28','search',50)"]){
  const {sqlite}=setup();try{
   sqlite.exec("UPDATE youtube_control SET blocked_until=1790661590,last_error_code='quota_exceeded'; INSERT INTO youtube_api_budget VALUES('2026-09-27','search',12); UPDATE youtube_sources SET page_token='saved-page',pages=2,revision=7; INSERT INTO youtube_videos(video_id,decision) VALUES('KeepMe12345','held')");
   if(change)sqlite.exec(change);
   const snapshot=()=>['youtube_sources','youtube_videos','youtube_api_budget'].map(table=>sqlite.prepare('SELECT * FROM '+table).all());const before=snapshot();
   const control=sqlite.prepare('SELECT * FROM youtube_control').get();sqlite.exec(sql);
   if(change)assert.deepEqual(sqlite.prepare('SELECT * FROM youtube_control').get(),control);
   else{assert.equal(sqlite.prepare('SELECT blocked_until FROM youtube_control').get().blocked_until,0);assert.equal(sqlite.prepare('SELECT last_error_code FROM youtube_control').get().last_error_code,null);}
   assert.deepEqual(snapshot(),before);sqlite.exec(sql);assert.equal(sqlite.prepare('SELECT changes() n').get().n,0);
  }finally{sqlite.close();}
 }
});
