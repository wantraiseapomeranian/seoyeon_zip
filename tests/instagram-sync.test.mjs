import test from 'node:test';
import assert from 'node:assert/strict';
import {testDatabase} from './helpers/d1.mjs';
import {syncInstagram} from '../src/instagram-sync.mjs';
import worker from '../src/worker.mjs';
const task='Task123',run='Run123',dataset='Data123';
const rows=Array.from({length:12},(_,i)=>({shortCode:'Post_'+String(i).padStart(3,'0'),type:'Video',productType:'clips',displayUrl:'https://scontent.cdninstagram.com/'+i+'.jpg'}));
function setup(){const {sqlite,DB}=testDatabase();return {sqlite,DB,env:{DB,APIFY_TOKEN:'test-token',APIFY_TASK_ID:task,APIFY_SYNC_ENABLED:'true'}};}
function fake({bad=false,fail=false}={}){return async(url,options)=>{assert.equal(options.method,'GET');assert.equal(options.headers.Authorization,'Bearer test-token');assert.ok(!String(url).includes('test-token'));const u=new URL(url);if(u.pathname.includes('actor-tasks'))return Response.json({data:{items:[{id:run,status:'SUCCEEDED',defaultDatasetId:dataset,finishedAt:'2026-09-10T00:00:00Z'}]}});if(!u.pathname.endsWith('/items'))return Response.json({data:{id:dataset,itemCount:rows.length}});if(fail)return new Response('',{status:503});const offset=Number(u.searchParams.get('offset'));return Response.json(bad?[{error:'failure'}]:rows.slice(offset,offset+10));};}

test('successful and empty polls remain eligible at the next five-minute cron',async()=>{
 const {sqlite,env}=setup();let now=430;sqlite.function('unixepoch',()=>now);
 const base=fake();const fetcher=async(...args)=>{now+=2;return base(...args);};
 try{
  assert.equal((await syncInstagram(env,{fetcher})).status,'progress');
  now=730;assert.equal((await syncInstagram(env,{fetcher})).status,'complete');
  now=1030;await syncInstagram(env,{fetcher});
  const before=sqlite.prepare('SELECT last_checked_at FROM instagram_sync').get();
  assert.ok(before.last_checked_at);
  let calls=0;now=1330;await syncInstagram(env,{fetcher:async(...args)=>{calls++;return fetcher(...args);}});assert.equal(calls,1);
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM instagram_review').get().n,12);
 }finally{sqlite.close();}
});
test('completed task pages enter pending, preserve decisions and do not replay finished runs',async()=>{
 const {sqlite,DB,env}=setup();try{
 await syncInstagram(env,{fetcher:fake()});assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM instagram_review').get().n,10);
 sqlite.exec("UPDATE instagram_review SET status='kept',revision=3 WHERE code='Post_000'; UPDATE instagram_sync SET next_due_at=0");
 await syncInstagram(env,{fetcher:fake()});assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM instagram_review').get().n,12);
 assert.equal(sqlite.prepare('SELECT state FROM instagram_sync_runs').get().state,'complete');
 sqlite.exec('UPDATE instagram_sync SET next_due_at=0; UPDATE instagram_sync_runs SET next_due_at=0');await syncInstagram(env,{fetcher:fake()});
 assert.deepEqual({...sqlite.prepare("SELECT status,revision FROM instagram_review WHERE code='Post_000'").get()},{status:'kept',revision:3});
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM instagram_review WHERE status='pending'").get().n,11);
 }finally{sqlite.close();}
});
test('malformed and failed pages never advance checkpoint; retry succeeds',async()=>{
 const {sqlite,env}=setup();try{for(const scenario of [{bad:true},{fail:true}]){await syncInstagram(env,{fetcher:fake(scenario)});assert.equal(sqlite.prepare('SELECT item_offset FROM instagram_sync_runs').get().item_offset,0);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM instagram_review').get().n,0);sqlite.exec('UPDATE instagram_sync SET next_due_at=0; UPDATE instagram_sync_runs SET next_due_at=0');}await syncInstagram(env,{fetcher:fake()});assert.equal(sqlite.prepare('SELECT item_offset FROM instagram_sync_runs').get().item_offset,10);}finally{sqlite.close();}
});
test('disabled, unconfigured and leased sync never contacts provider',async()=>{
 const {sqlite,env}=setup();const fetcher=()=>{throw Error('unexpected network');};try{assert.equal((await syncInstagram({...env,APIFY_TOKEN:''},{fetcher})).status,'unconfigured');assert.equal((await syncInstagram({...env,APIFY_SYNC_ENABLED:'false'},{fetcher})).status,'disabled');await syncInstagram(env,{fetcher:fake()});sqlite.exec('UPDATE instagram_sync SET next_due_at=0,lease_until=unixepoch()+100');assert.equal((await syncInstagram(env,{fetcher})).status,'idle');}finally{sqlite.close();}
});
test('checkpoint write failure rolls back imported posts and permits retry',async()=>{
 const {sqlite,env}=setup();try{
 sqlite.exec("CREATE TRIGGER fail_sync BEFORE UPDATE OF item_offset ON instagram_sync_runs BEGIN SELECT RAISE(ABORT,'injected'); END;");
 assert.equal((await syncInstagram(env,{fetcher:fake()})).status,'retry');
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM instagram_review').get().n,0);
 assert.equal(sqlite.prepare('SELECT item_offset FROM instagram_sync_runs').get().item_offset,0);
 sqlite.exec('DROP TRIGGER fail_sync; UPDATE instagram_sync SET next_due_at=0; UPDATE instagram_sync_runs SET next_due_at=0');
 assert.equal((await syncInstagram(env,{fetcher:fake()})).status,'progress');
 }finally{sqlite.close();}
});
test('a stale sync lease cannot commit a downloaded page',async()=>{
 const {sqlite,env}=setup();try{
 const base=fake();const fetcher=async(url,options)=>{const response=await base(url,options);if(new URL(url).pathname.endsWith('/items'))sqlite.exec("UPDATE instagram_sync SET lease_token='new-owner'");return response;};
 assert.equal((await syncInstagram(env,{fetcher})).status,'retry');
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM instagram_review').get().n,0);
 assert.equal(sqlite.prepare('SELECT lease_token FROM instagram_sync').get().lease_token,'new-owner');
 }finally{sqlite.close();}
});
test('sync status route stays behind private authorization',async()=>{
 assert.equal((await worker.fetch(new Request('https://example.test/api/admin/instagram/sync'),{})).status,503);
});
test('permanent failure in an older run does not starve a later valid run',async()=>{
 const {sqlite,env}=setup();try{
 const fetcher=async(url,options)=>{const path=new URL(url).pathname;
  if(path.includes('actor-tasks'))return Response.json({data:{items:[{id:run,status:'SUCCEEDED',defaultDatasetId:dataset,finishedAt:'2026-09-10T00:00:00Z'},{id:'LaterRun',status:'SUCCEEDED',defaultDatasetId:'LaterData',finishedAt:'2026-09-10T01:00:00Z'}]}});
  if(path.includes(dataset))return new Response('',{status:404});
  if(!path.endsWith('/items'))return Response.json({data:{id:'LaterData',itemCount:12}});
  return fake()(url,options);
 };
 await syncInstagram(env,{fetcher});sqlite.exec('UPDATE instagram_sync SET next_due_at=0');
 assert.equal((await syncInstagram(env,{fetcher})).status,'progress');
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM instagram_review').get().n,10);
 assert.equal(sqlite.prepare('SELECT item_offset FROM instagram_sync_runs WHERE id=?').get(run).item_offset,0);
 }finally{sqlite.close();}
});
