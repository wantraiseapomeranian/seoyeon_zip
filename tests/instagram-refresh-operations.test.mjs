import test from 'node:test';
import assert from 'node:assert/strict';
import {testDatabase} from './helpers/d1.mjs';
import {readOperationsState} from '../src/operations.mjs';

const now=1780000000;
function setup(){
 const d=testDatabase();d.sqlite.function('unixepoch',()=>now);
 return {...d,env:{DB:d.DB,APIFY_SYNC_ENABLED:'true',APIFY_TASK_ID:'task123',APIFY_TOKEN:'fixture-token',INSTAGRAM_MEDIA_REFRESH_ENABLED:'true'}};
}
function post(d,code='Post_001',{status='kept',kind='image'}={}){
 const data=JSON.stringify({id:'ig:'+code,author:'fixture',images:['https://private.test/image?secret=token'],media:[{kind,previewUrl:'https://private.test/image?secret=token'}]});
 d.sqlite.prepare('INSERT INTO instagram_review(code,data,imported_at,status) VALUES(?,?,?,?)').run(code,data,'2026-01-01',status);
}
const read=async d=>(await readOperationsState(d.env,{details:false})).instagramRefresh;

test('refresh health is included without writing or exposing provider state',async t=>{
 const d=setup();t.after(()=>d.sqlite.close());post(d);
 d.sqlite.exec("UPDATE instagram_media_refresh SET state='error',last_error='start_uncertain',run_id='private-run',codes_json='[\"Post_001\"]'");
 const before=d.sqlite.prepare('SELECT total_changes() n').get().n,state=await readOperationsState(d.env,{details:false});
 assert.equal(state.instagram.status,'waiting');
 assert.equal(state.instagramRefresh?.status,'attention');assert.equal(state.instagramRefresh.error,'start_uncertain');
 assert.equal(d.sqlite.prepare('SELECT total_changes() n').get().n,before);
 assert.doesNotMatch(JSON.stringify(state),/private|fixture-token|Post_001|secret/);
});

test('refresh configuration stops old failures and does not invent first success',async t=>{
 const d=setup();t.after(()=>d.sqlite.close());
 assert.deepEqual(await read(d),{status:'waiting',refreshedAt:null,nextDueAt:null,error:null,startsToday:0,dailyStartLimit:2,failedPosts:0,overduePosts:0});
 d.sqlite.exec("UPDATE instagram_media_refresh SET state='error',last_error='start_uncertain'");
 for(const flag of ['INSTAGRAM_MEDIA_REFRESH_ENABLED','APIFY_SYNC_ENABLED']){
  assert.equal((await read({...d,env:{...d.env,[flag]:'false'}})).status,'disabled');
 }
 assert.equal((await read({...d,env:{...d.env,APIFY_TOKEN:''}})).status,'unconfigured');
});

test('leases and durable polling distinguish active starts from uncertain starts',async t=>{
 const d=setup();t.after(()=>d.sqlite.close());post(d);
 for(const [sql,want] of [
  ["state='starting',lease_until=1780000120",'running'],
  ["lease_until=1780000000",'attention'],
  ["state='waiting',started_at=1779999990,lease_until=0,next_due_at=1780000060",'running'],
  ["next_due_at=1779999100",'delayed'],
  ["next_due_at=1780000060,last_error='provider_network',failures=1",'retry'],
  ["state='error',lease_until=1780000120,last_error='secret https://private.test/?token=leak'",'attention']
 ]){d.sqlite.exec('UPDATE instagram_media_refresh SET '+sql);assert.equal((await read(d)).status,want);}
 assert.equal((await read(d)).error,'unknown_error');
});

test('refresh failures and due work only count currently public photos',async t=>{
 const d=setup();t.after(()=>d.sqlite.close());
 for(const [code,status,kind] of [['Post_001','kept','image'],['Post_002','excluded','image'],['Post_003','pending','image'],['Post_004','kept','video']]){
  post(d,code,{status,kind});d.sqlite.prepare('INSERT INTO instagram_media_refresh_posts(code,next_due_at,failures,last_error) VALUES(?,?,1,?)').run(code,now-1800,'provider_post_error');
 }
 let state=await read(d);assert.equal(state.failedPosts,1);assert.equal(state.overduePosts,1);assert.equal(state.status,'retry');
 d.sqlite.exec("UPDATE instagram_review SET status='excluded' WHERE code='Post_001'; UPDATE instagram_media_refresh SET last_success_at=1779999000,last_error='partial_refresh',next_due_at=1779990000");
 state=await read(d);assert.equal(state.failedPosts,0);assert.equal(state.overduePosts,0);assert.equal(state.status,'healthy');
});

test('three day success and empty hourly queues do not manufacture delayed work',async t=>{
 const d=setup();t.after(()=>d.sqlite.close());
 d.sqlite.exec('UPDATE instagram_media_refresh SET next_due_at=1779990000');
 assert.equal((await read(d)).status,'waiting');post(d);
 d.sqlite.exec('UPDATE instagram_media_refresh SET last_success_at=1779990000');
 d.sqlite.prepare('INSERT INTO instagram_media_refresh_posts(code,next_due_at,last_success_at) VALUES(?,?,?)').run('Post_001',now+3*86400,now-60);
 let state=await read(d);assert.equal(state.status,'healthy');assert.equal(state.nextDueAt,'2026-05-31T20:26:40.000Z');
 d.sqlite.exec('UPDATE instagram_media_refresh_posts SET next_due_at=1779999100');assert.equal((await read(d)).status,'delayed');
 d.sqlite.exec('UPDATE instagram_media_refresh SET next_due_at=1780000300');assert.equal((await read(d)).status,'healthy');
});

test('daily budget waits are normal while preserving failures and reset at UTC midnight',async t=>{
 const d=setup();t.after(()=>d.sqlite.close());post(d);
 d.sqlite.prepare("UPDATE instagram_media_refresh SET budget_day=?,starts_today=2,next_due_at=?,last_error='daily_budget'").run(20601,1780012800);
 let state=await read(d);assert.equal(state.status,'budget_wait');assert.equal(state.startsToday,2);assert.equal(state.error,null);
 d.sqlite.prepare('INSERT INTO instagram_media_refresh_posts(code,next_due_at,failures,last_error) VALUES(?,?,1,?)').run('Post_001',now-2000,'missing_post');
 state=await read(d);assert.equal(state.status,'budget_wait');assert.equal(state.failedPosts,1);assert.equal(state.overduePosts,1);
 d.sqlite.function('unixepoch',()=>1780012800);
 state=await read(d);assert.equal(state.startsToday,0);assert.equal(state.status,'retry');
});

test('refresh query failure stays isolated and carries the full unavailable contract',async t=>{
 const d=setup();t.after(()=>d.sqlite.close());d.sqlite.exec('DROP TABLE instagram_media_refresh_posts');
 const state=await readOperationsState(d.env,{details:false});
 assert.equal(state.instagram.status,'waiting');assert.equal(state.youtube.status,'disabled');
 assert.deepEqual(state.instagramRefresh,{status:'unavailable',refreshedAt:null,nextDueAt:null,error:null,startsToday:0,dailyStartLimit:2,failedPosts:0,overduePosts:0});
});
