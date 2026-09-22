import test from 'node:test';
import assert from 'node:assert/strict';
import {testDatabase} from './helpers/d1.mjs';

const module = await import('../src/operations.mjs');
const request=()=>new Request('https://example.test/api/admin/operations');
const setup=()=>{const db=testDatabase();return {...db,env:{DB:db.DB,COLLECTION_ENABLED:'true',APIFY_SYNC_ENABLED:'true',APIFY_TASK_ID:'task123',APIFY_TOKEN:'secret-token',MANUAL_MEDIA_ENABLED:'true'}};};
async function get(env){assert.equal(typeof module.handleOperations,'function','operations handler exists');return module.handleOperations(request(),env);}
const source=data=>data.x.sources.find(s=>s.source==='Seowoo_0501');

test('history uncertainty is separate from collection health and never masks failures or delay',async()=>{
 const {sqlite,env,enable}=setup();enable();
 for(const [catchup,code] of [['gap','history_window_unverified'],['gap','unverified_exhaustion'],['gap','repeated_cursor'],['limited',null]]){
  sqlite.prepare("UPDATE collection_state SET history_paused=1,catchup_status=?,last_error_code=?,failures=0,last_success_at=unixepoch()-60,next_due_at=unixepoch()+300 WHERE source='Seowoo_0501'").run(catchup,code);
  let row=source(await (await get(env)).json());
  assert.equal(row.status,'healthy');assert.equal(row.error,null);
  assert.equal(row.historyStatus,catchup==='limited'?'limited':'unverified');
  sqlite.exec("UPDATE collection_state SET failures=1,last_error_code='provider_http:429' WHERE source='Seowoo_0501'");
  row=source(await (await get(env)).json());assert.equal(row.status,'retry');assert.equal(row.error,'provider_http:429');
  sqlite.exec("UPDATE collection_state SET failures=0,last_error_code='history_window_unverified',next_due_at=unixepoch()-7200 WHERE source='Seowoo_0501'");
  assert.equal(source(await (await get(env)).json()).status,'delayed');
 }
 sqlite.exec("UPDATE collection_state SET catchup_status='needs_attention',last_error_code='provider_schema',next_due_at=unixepoch()+300 WHERE source='Seowoo_0501'");
 assert.equal(source(await (await get(env)).json()).status,'attention');
});

test('empty operations are read only, private, and do not manufacture overdue alerts',async()=>{
 const {sqlite,env}=setup();const before=sqlite.prepare('SELECT total_changes() n').get().n;
 const response=await get(env),data=await response.json();
 assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/private.*no-store/);
 assert.equal(sqlite.prepare('SELECT total_changes() n').get().n,before);
 assert.deepEqual(data.totals,{x:0,instagram:0,manual:0,youtube:0});assert.equal(data.x.enabled,false);
 assert.equal(data.instagram.status,'waiting');assert.equal(data.instagram.overdue,0);assert.equal(data.manual.overdue,0);
 assert.equal(data.instagram.syncedAt,null);assert.ok(Date.parse(data.generatedAt));
});

test('X distinguishes disabled, healthy, running, retry, attention, delayed, and completed history',async()=>{
 const {sqlite,env,enable}=setup();enable();
 for(const [sql,status] of [
  ["last_attempt_at=NULL,last_success_at=NULL,next_due_at=0,lease_until=0,failures=0,last_error_code=NULL,catchup_status='idle'",'waiting'],
  ["last_attempt_at=unixepoch()-2000,next_due_at=0",'delayed'],
  ["next_due_at=unixepoch()-100, last_success_at=unixepoch()-300",'healthy'],
  ["next_due_at=unixepoch()-2000,lease_until=unixepoch()+60",'running'],
  ["lease_until=0,next_due_at=unixepoch()+1800,failures=1,last_error_code='provider_http:429',catchup_status='retry'",'retry'],
  ["next_due_at=unixepoch()-2000",'delayed'],
  ["catchup_status='needs_attention'",'attention'],
  ["enabled=0",'disabled'],
 ]){sqlite.exec(`UPDATE collection_state SET ${sql} WHERE source='Seowoo_0501'`);assert.equal(source(await (await get(env)).json()).status,status);}
 sqlite.exec("UPDATE collection_state SET enabled=0,history_paused=1,catchup_status='limited',last_success_at=unixepoch()-100,failures=0,last_error_code=NULL WHERE source='wavefunc0806'");
 assert.equal((await (await get(env)).json()).x.sources.find(s=>s.source==='wavefunc0806').status,'completed');
});

test('X delay allows a full three minute source rotation before alerting',async()=>{
 const {sqlite,env,enable}=setup();enable();
 sqlite.exec("UPDATE collection_state SET enabled=1,catchup_status='idle',next_due_at=unixepoch()-1200,last_success_at=unixepoch()-1400");
 let data=await (await get(env)).json();assert.equal(data.x.sources.length,16);assert.equal(data.x.delayGraceSeconds,2880);
 assert.ok(data.x.sources.every(row=>row.status==='healthy'));assert.equal(data.delayGraceSeconds,900);
 sqlite.exec('UPDATE collection_state SET next_due_at=unixepoch()-7200');
 data=await (await get(env)).json();assert.ok(data.x.sources.every(row=>row.status==='delayed'));
 sqlite.exec("UPDATE collection_state SET catchup_status='needs_attention' WHERE source!='Seowoo_0501'");
 data=await (await get(env)).json();assert.equal(data.x.delayGraceSeconds,900);
});

test('Instagram scopes pending errors to current task, preserves check time, and detects mismatch',async()=>{
 const {sqlite,env}=setup();sqlite.exec("INSERT INTO instagram_sync(id,task_id,last_checked_at,next_due_at) VALUES(1,'task123','2026-01-01T00:00:00Z',unixepoch()+100); INSERT INTO instagram_sync_runs(id,task_id,dataset_id,finished_at,last_error) VALUES('old','other','secret-dataset','2020-01-01T00:00:00Z','secret-error')");
 let data=await (await get(env)).json();assert.equal(data.instagram.status,'healthy');assert.equal(data.instagram.pendingErrors,0);assert.equal(data.instagram.syncedAt,null);assert.equal(data.instagram.checkedAt,'2026-01-01T00:00:00.000Z');
 sqlite.exec("INSERT INTO instagram_sync_runs(id,task_id,dataset_id,finished_at,last_error,next_due_at) VALUES('new','task123','secret-dataset','2020-01-01T00:00:00Z','apify_http_429',unixepoch()+1800)");
 data=await (await get(env)).json();assert.equal(data.instagram.status,'retry');assert.equal(data.instagram.pending,1);assert.equal(data.instagram.pendingErrors,1);assert.equal(data.instagram.overdue,0);
 sqlite.exec('UPDATE instagram_sync SET next_due_at=unixepoch()-2000,lease_until=unixepoch()+120');
 assert.equal((await (await get(env)).json()).instagram.status,'running');
 sqlite.exec("UPDATE instagram_sync SET task_id='anotherTask'");
 data=await (await get(env)).json();assert.equal(data.instagram.status,'attention');assert.equal(data.instagram.error,'task_mismatch');
 assert.doesNotMatch(JSON.stringify(data),/secret|anotherTask|task123|dataset/);
});

test('manual aggregate overdue excludes leases, backoff and disabled jobs',async()=>{
 const {sqlite,env}=setup();
 for(const [id,state,due,lease] of [['a','pending',0,0],['b','starting',-2000,100],['c','waiting',1800,0],['d','failed',-2000,0],['e','ready',-2000,0]]){
  sqlite.prepare('INSERT INTO manual_posts(id,canonical_url,data,created_at) VALUES(?,?,?,?)').run(id,'https://example.test/'+id,'{"private":"secret-caption"}','2026-01-01');
  sqlite.prepare('INSERT INTO manual_media_jobs(post_id,state,next_due_at,lease_until,updated_at) VALUES(?,?,CASE WHEN ?=0 THEN 0 ELSE unixepoch()+? END,CASE WHEN ?=0 THEN 0 ELSE unixepoch()+? END,unixepoch()-3000)').run(id,state,due,due,lease,lease);
 }
 const data=await (await get(env)).json();assert.equal(data.manual.overdue,1);assert.equal(data.totals.manual,5);
 assert.deepEqual(data.manual.counts,{pending:1,starting:1,waiting:1,ready:1,no_media:0,failed:1,existing:0});
 assert.doesNotMatch(JSON.stringify(data),/secret-caption/);env.MANUAL_MEDIA_ENABLED='false';
 assert.equal((await (await get(env)).json()).manual.overdue,0);
});

test('operations sanitizes errors and rejects methods and database failure without leaks',async()=>{
 const {sqlite,env,enable}=setup();enable();sqlite.exec("UPDATE collection_state SET last_error_code='secret_token_123',catchup_status='needs_attention' WHERE source='Seowoo_0501'");
 assert.equal(source(await (await get(env)).json()).error,'unknown_error');
 const rejected=await module.handleOperations(new Request(request(),{method:'POST'}),{});assert.equal(rejected.status,405);assert.equal(rejected.headers.get('allow'),'GET');
 const failed=await get({DB:{prepare(){throw Error('secret-token SQL password');}}});assert.equal(failed.status,503);assert.doesNotMatch(await failed.text(),/secret|SQL|password/);
});

test('disabled and invalid Instagram config never alert for old state',async()=>{
 const {sqlite,env}=setup();sqlite.exec("INSERT INTO instagram_sync(id,task_id,last_error,next_due_at) VALUES(1,'task123','apify_http_500',1)");
 env.APIFY_SYNC_ENABLED='false';assert.equal((await (await get(env)).json()).instagram.status,'disabled');
 env.APIFY_SYNC_ENABLED='true';env.APIFY_TASK_ID='invalid-task!';assert.equal((await (await get(env)).json()).instagram.status,'unconfigured');
});

test('Instagram zero due uses check time and overdue runs respect leases and scheduler backoff',async()=>{
 const {sqlite,env}=setup();
 sqlite.exec("INSERT INTO instagram_sync(id,task_id,last_checked_at) VALUES(1,'task123',strftime('%Y-%m-%dT%H:%M:%fZ','now')); INSERT INTO instagram_sync_runs(id,task_id,dataset_id,finished_at) VALUES('run123','task123','dataset123','2020-01-01T00:00:00Z')");
 let data=await (await get(env)).json();assert.equal(data.instagram.status,'healthy');assert.equal(data.instagram.overdue,0);
 sqlite.exec("UPDATE instagram_sync SET last_checked_at=strftime('%Y-%m-%dT%H:%M:%fZ','now','-2000 seconds')");
 data=await (await get(env)).json();assert.equal(data.instagram.status,'delayed');assert.equal(data.instagram.overdue,1);
 sqlite.exec('UPDATE instagram_sync SET lease_until=unixepoch()+120');
 data=await (await get(env)).json();assert.equal(data.instagram.status,'running');assert.equal(data.instagram.overdue,0);
 sqlite.exec("UPDATE instagram_sync SET lease_until=0,next_due_at=unixepoch()+1800,last_error='apify_http_429',failures=1");
 data=await (await get(env)).json();assert.equal(data.instagram.status,'retry');assert.equal(data.instagram.overdue,0);
});

test('totals count storage records without loading private content or writing populated state',async()=>{
 const {sqlite,env}=setup();
 sqlite.exec("INSERT INTO posts(id,data) VALUES('x:123','{\"caption\":\"secret content\"}'); INSERT INTO instagram_review(code,data,imported_at,status) VALUES('ig123','{\"caption\":\"secret content\"}','2026-01-01','excluded')");
 const before=sqlite.prepare('SELECT total_changes() AS n').get().n;
 const data=await (await get(env)).json();assert.deepEqual(data.totals,{x:1,instagram:1,manual:0,youtube:0});assert.doesNotMatch(JSON.stringify(data),/secret content/);
 assert.equal(sqlite.prepare('SELECT total_changes() AS n').get().n,before);
});
