import test from 'node:test';
import assert from 'node:assert/strict';
import {testDatabase} from './helpers/d1.mjs';
import {importInstagram} from '../src/instagram-import.mjs';
import worker,{handleApi} from '../src/worker.mjs';
const url=(name,version='old',extra='')=>`https://scontent.cdninstagram.com/v/t51/${name}.jpg?oh=${version}&oe=abcdef${extra}`;
async function setup(count=1){
 const {sqlite,DB}=testDatabase();let now=1780000000;sqlite.function('unixepoch',()=>now);
 for(let i=0;i<count;i++)await importInstagram(DB,[{shortCode:`Post_${String(i).padStart(3,'0')}`,ownerUsername:'test.author',caption:'Original caption',timestamp:'2026-01-01',type:'Sidecar',childPosts:[{type:'Image',displayUrl:url(`one${i}`)},{type:'Image',displayUrl:url(`two${i}`)}]}]);
 sqlite.exec("UPDATE instagram_review SET status='kept',revision=7,reviewed_at='original'");
 return {sqlite,DB,env:{DB,APIFY_TOKEN:'test-token',APIFY_SYNC_ENABLED:'true',INSTAGRAM_MEDIA_REFRESH_ENABLED:'true'},advance:(seconds=400)=>{now+=seconds;},now:()=>now};
}
const load=()=>import('../src/instagram-media-refresh.mjs');
function provider(rows,{postError=false,getError=false,mutate=()=>{},runStatus='SUCCEEDED'}={}){
 const calls=[];const fetcher=async(address,options)=>{
  const u=new URL(address);calls.push({url:u,options});assert.equal(options.headers.Authorization,'Bearer test-token');
  if(options.method==='POST'){assert.equal(u.searchParams.get('timeout'),'120');assert.equal(u.searchParams.get('maxTotalChargeUsd'),'0.05');const body=JSON.parse(options.body);assert.equal(body.resultsLimit,1);assert.ok(body.directUrls.length<=18);if(postError)throw Error('network');return Response.json({data:{id:'Run123'}});}
  if(getError)throw Error('network');if(u.pathname.endsWith('/items')){assert.equal(u.searchParams.get('limit'),'19');mutate();return Response.json(rows);}
  return Response.json({data:{id:'Run123',status:runStatus,defaultDatasetId:'Data123'}});
 };return {fetcher,calls};
}
const row=(i=0)=>({shortCode:`Post_${String(i).padStart(3,'0')}`,ownerUsername:'test.author',caption:'Provider changes must be ignored',type:'Sidecar',childPosts:[{type:'Image',displayUrl:url(`two${i}`,'new')},{type:'Image',displayUrl:url(`one${i}`,'new')}]});
async function complete(s,p){const {refreshInstagramMedia}=await load();assert.equal((await refreshInstagramMedia(s.env,{fetcher:p.fetcher})).status,'waiting');s.advance();return refreshInstagramMedia(s.env,{fetcher:p.fetcher});}

test('disabled, empty, and leased refreshes never call provider',async()=>{
 const s=await setup(0);try{const {refreshInstagramMedia}=await load();const fetcher=()=>{throw Error('unexpected network');};assert.equal((await refreshInstagramMedia({...s.env,INSTAGRAM_MEDIA_REFRESH_ENABLED:'false'},{fetcher})).status,'disabled');assert.equal((await refreshInstagramMedia({...s.env,APIFY_SYNC_ENABLED:'false'},{fetcher})).status,'disabled');assert.equal((await refreshInstagramMedia(s.env,{fetcher})).status,'idle');s.sqlite.exec('UPDATE instagram_media_refresh SET lease_until=unixepoch()+60');assert.equal((await refreshInstagramMedia(s.env,{fetcher})).status,'idle');}finally{s.sqlite.close();}
});

test('batch cap18, success interval3days and daily two paid starts',async()=>{
 const s=await setup(40);try{const {refreshInstagramMedia}=await load();const p=provider(Array.from({length:18},(_,i)=>row(i)));assert.equal((await complete(s,p)).status,'complete');assert.equal(JSON.parse(p.calls[0].options.body).directUrls.length,18);const state=s.sqlite.prepare('SELECT * FROM instagram_media_refresh_posts WHERE code=?').get('Post_000');assert.equal(state.next_due_at,s.now()+3*86400);s.advance();const p2=provider(Array.from({length:18},(_,i)=>row(i+18)));assert.equal((await complete(s,p2)).status,'complete');s.advance();const p3=provider([]);assert.equal((await refreshInstagramMedia(s.env,{fetcher:p3.fetcher})).status,'budget_wait');assert.equal(p3.calls.length,0);assert.equal(s.sqlite.prepare('SELECT starts_today FROM instagram_media_refresh').get().starts_today,2);}finally{s.sqlite.close();}
});
test('reordered renewal preserves all metadata, decisions and fingerprint evidence atomically',async()=>{
 const s=await setup();try{const old=s.sqlite.prepare('SELECT * FROM instagram_review').get();s.sqlite.prepare('INSERT INTO x_fingerprints(url,hash,confirmed_hash,dhash,width,height,near_url,candidate_metadata_json) VALUES(?,?,?,?,?,?,?,?)').run(url('one0'),'hash1','confirmed1','dhash1',100,200,url('two0'),'{}');s.sqlite.prepare('INSERT INTO x_photo_differences(left_url,right_url) VALUES(?,?)').run(url('one0'),url('two0'));const p=provider([row()]);assert.equal((await complete(s,p)).status,'complete');const fresh=s.sqlite.prepare('SELECT * FROM instagram_review').get(),data=JSON.parse(fresh.data),prior=JSON.parse(old.data);assert.deepEqual({...fresh,data:old.data},{...old});assert.deepEqual(data.images,[url('one0','new'),url('two0','new')]);assert.deepEqual(data.media.map(m=>m.kind),prior.media.map(m=>m.kind));assert.deepEqual({...data,image:prior.image,images:prior.images,media:prior.media},prior);const f=s.sqlite.prepare('SELECT * FROM x_fingerprints WHERE url=?').get(url('one0','new'));assert.equal(f.hash,'hash1');assert.equal(f.confirmed_hash,'confirmed1');assert.equal(f.near_url,url('two0','new'));assert.ok(s.sqlite.prepare('SELECT 1 FROM x_photo_differences WHERE left_url=? AND right_url=?').get(url('one0','new'),url('two0','new')));}finally{s.sqlite.close();}
});
test('missing, unrelated, duplicate and malformed author responses retain originals with backoff',async()=>{
 for(const rows of [[],[{...row(),shortCode:'Wrong_123'}],[row(),row()],[{...row(),ownerUsername:'evil/author'}],[{...row(),ownerUsername:'someone.else'}]]){const s=await setup();try{const before=s.sqlite.prepare('SELECT data FROM instagram_review').get().data;const result=await complete(s,provider(rows));assert.equal(result.updated,0);assert.equal(s.sqlite.prepare('SELECT data FROM instagram_review').get().data,before);const status=s.sqlite.prepare('SELECT failures,next_due_at,last_error FROM instagram_media_refresh_posts').get();assert.equal(status.failures,1);assert.ok(status.next_due_at>s.now());assert.ok(status.last_error);}finally{s.sqlite.close();}}
});
test('partial carousel renews confidently matched URLs and retains missing assets, ambiguous identity fails',async()=>{
 const s=await setup();try{const result=await complete(s,provider([{...row(),childPosts:[row().childPosts[0]]}]));assert.equal(result.updated,1);assert.deepEqual(JSON.parse(s.sqlite.prepare('SELECT data FROM instagram_review').get().data).images,[url('one0'),url('two0','new')]);assert.equal(s.sqlite.prepare('SELECT failures FROM instagram_media_refresh_posts').get().failures,1);}finally{s.sqlite.close();}
 const a=await setup();try{const before=a.sqlite.prepare('SELECT data FROM instagram_review').get().data;const r=row();r.childPosts.push({...r.childPosts[0],displayUrl:url('two0','variant')});await complete(a,provider([r]));assert.equal(a.sqlite.prepare('SELECT data FROM instagram_review').get().data,before);}finally{a.sqlite.close();}
});
test('different rendition never receives old byte hashes or overrides confirmed dedup evidence',async()=>{
 const s=await setup();try{s.sqlite.prepare('INSERT INTO x_fingerprints(url,hash,confirmed_hash) VALUES(?,?,?)').run(url('one0'),'hash1','confirmed1');const r=row();r.childPosts[1].displayUrl=url('one0','new','&stp=crop');await complete(s,provider([r]));assert.equal(JSON.parse(s.sqlite.prepare('SELECT data FROM instagram_review').get().data).images[0],url('one0'));assert.equal(s.sqlite.prepare('SELECT COUNT(*) n FROM x_fingerprints').get().n,1);}finally{s.sqlite.close();}
});
test('lost paid start is durable blocked status and never automatically replays',async()=>{
 const s=await setup();try{const {refreshInstagramMedia,instagramMediaRefreshStatus}=await load();const p=provider([],{postError:true});assert.equal((await refreshInstagramMedia(s.env,{fetcher:p.fetcher})).status,'blocked');s.advance(86400);assert.equal((await refreshInstagramMedia(s.env,{fetcher:p.fetcher})).status,'blocked');assert.equal(p.calls.length,1);assert.equal((await instagramMediaRefreshStatus(s.env)).error,'start_uncertain');}finally{s.sqlite.close();}
});
test('expired starting lease remains blocked and preserves reserved daily budget',async()=>{
 const s=await setup();try{s.sqlite.exec("UPDATE instagram_media_refresh SET state='starting',codes_json='[\"Post_000\"]',starts_today=1,lease_until=unixepoch()-1");const {refreshInstagramMedia}=await load();const p=provider([]);assert.equal((await refreshInstagramMedia(s.env,{fetcher:p.fetcher})).status,'blocked');assert.equal(p.calls.length,0);}finally{s.sqlite.close();}
});
test('transient polling error resumes the same run without another paid start',async()=>{
 const s=await setup();try{const {refreshInstagramMedia}=await load();const start=provider([]);await refreshInstagramMedia(s.env,{fetcher:start.fetcher});s.advance();assert.equal((await refreshInstagramMedia(s.env,{fetcher:provider([],{getError:true}).fetcher})).status,'retry');assert.equal(s.sqlite.prepare('SELECT run_id,state FROM instagram_media_refresh').get().run_id,'Run123');s.advance();const p=provider([row()]);assert.equal((await refreshInstagramMedia(s.env,{fetcher:p.fetcher})).status,'complete');assert.equal(p.calls.filter(c=>c.options.method==='POST').length,0);}finally{s.sqlite.close();}
});
test('waiting lease contention and timeout release without replaying paid runs',async()=>{
 const s=await setup();try{const {refreshInstagramMedia}=await load();const p=provider([],{runStatus:'RUNNING'});await refreshInstagramMedia(s.env,{fetcher:p.fetcher});s.advance();s.sqlite.exec('UPDATE instagram_media_refresh SET lease_until=unixepoch()+60');assert.equal((await refreshInstagramMedia(s.env,{fetcher:p.fetcher})).status,'idle');s.advance(2000);const result=await refreshInstagramMedia(s.env,{fetcher:p.fetcher});assert.equal(result.status,'retry');assert.equal(result.error,'run_timeout');assert.equal(p.calls.filter(c=>c.options.method==='POST').length,1);}finally{s.sqlite.close();}
});
test('concurrent moderation, import and lost lease are preserved during renewal',async()=>{
 for(const mutation of ["UPDATE instagram_review SET status='excluded',revision=8", "UPDATE instagram_review SET data=json_set(data,'$.caption','Concurrent import')", "UPDATE instagram_media_refresh SET lease_token='other-owner'", "UPDATE instagram_media_refresh SET lease_until=unixepoch()-1"]){const s=await setup();try{const p=provider([row()],{mutate:()=>s.sqlite.exec(mutation)});await complete(s,p);const data=JSON.parse(s.sqlite.prepare('SELECT data FROM instagram_review').get().data);assert.equal(data.images[0],url('one0'));if(mutation.includes('excluded'))assert.equal(s.sqlite.prepare('SELECT status FROM instagram_review').get().status,'excluded');if(mutation.includes('caption'))assert.equal(data.caption,'Concurrent import');}finally{s.sqlite.close();}}
});
test('write failure rolls back URLs, fingerprints and completion together',async()=>{
 const s=await setup();try{s.sqlite.prepare('INSERT INTO x_fingerprints(url,hash) VALUES(?,?)').run(url('one0'),'hash1');s.sqlite.exec("CREATE TRIGGER fail_refresh BEFORE UPDATE OF last_success_at ON instagram_media_refresh BEGIN SELECT RAISE(ABORT,'injected'); END");await complete(s,provider([row()]));assert.equal(JSON.parse(s.sqlite.prepare('SELECT data FROM instagram_review').get().data).images[0],url('one0'));assert.equal(s.sqlite.prepare('SELECT COUNT(*) n FROM x_fingerprints').get().n,1);assert.equal(s.sqlite.prepare('SELECT state FROM instagram_media_refresh').get().state,'waiting');}finally{s.sqlite.close();}
});
test('new fingerprint evidence before commit remains on the source when using a rendition alias',async()=>{
 const s=await setup();try{
  const batch=s.DB.batch.bind(s.DB);let injected=false;
  s.DB.batch=async statements=>{if(!injected&&statements.some(q=>q.sql.startsWith('UPDATE instagram_review'))){injected=true;s.sqlite.prepare('INSERT INTO x_fingerprints(url,hash,confirmed_hash) VALUES(?,?,?)').run(url('one0'),'late-hash','late-confirmed');}return batch(statements);};
  const r=row();r.childPosts[1].displayUrl=url('one0','new','&stp=crop');
  const result=await complete(s,provider([r]));assert.equal(result.status,'complete');assert.equal(result.aliased,1);
  assert.equal(JSON.parse(s.sqlite.prepare('SELECT data FROM instagram_review').get().data).images[0],url('one0'));
  assert.equal(s.sqlite.prepare('SELECT COUNT(*) n FROM x_fingerprints').get().n,1);
  assert.equal(s.sqlite.prepare('SELECT preview_url FROM instagram_preview_urls WHERE source_url=?').get(url('one0')).preview_url,url('one0','new','&stp=crop'));
 }finally{s.sqlite.close();}
});
test('cron keeps collection and refresh failures separate and private status exposes refresh',async()=>{
 const s=await setup();const previous=globalThis.fetch;try{
  s.env.APIFY_TASK_ID='Task123';
  const prepare=s.DB.prepare.bind(s.DB);s.DB.prepare=sql=>{if(sql.startsWith('INSERT OR IGNORE INTO instagram_sync('))throw Error('injected sync failure');return prepare(sql);};
  const p=provider([]);globalThis.fetch=p.fetcher;
  await worker.scheduled({cron:'2-59/5 * * * *'},s.env,{waitUntil:()=>{}});
  assert.equal(p.calls.filter(c=>c.options.method==='POST').length,1);
  const response=await handleApi(new Request('https://example.test/api/admin/instagram/sync'),s.env,{});
  assert.equal((await response.json()).refresh.status,'waiting');
 }finally{globalThis.fetch=previous;s.sqlite.close();}
});
test('public feed and private status reads cannot start a paid run',async()=>{
 const s=await setup();const previous=globalThis.fetch;try{
  const p=provider([]);globalThis.fetch=p.fetcher;
  const response=await worker.fetch(new Request('https://example.test/api/feed'),{...s.env,PUBLIC_FEED_ENABLED:'true',PUBLIC_RATE_LIMITER:{limit:async()=>({success:true})}},{});
  assert.equal(response.status,200);
  await handleApi(new Request('https://example.test/api/admin/instagram/sync'),s.env,{});
  assert.equal(p.calls.length,0);
 }finally{globalThis.fetch=previous;s.sqlite.close();}
});
test('new UTC day restores daily start budget and only visible collected images are selected',async()=>{
 const s=await setup(2);try{
  s.sqlite.exec("UPDATE instagram_review SET status='excluded' WHERE code='Post_001'; UPDATE instagram_media_refresh SET starts_today=2,budget_day=CAST(unixepoch()/86400 AS INTEGER)");
  const {refreshInstagramMedia}=await load();const p=provider([]);assert.equal((await refreshInstagramMedia(s.env,{fetcher:p.fetcher})).status,'budget_wait');s.advance(86400);
  assert.equal((await refreshInstagramMedia(s.env,{fetcher:p.fetcher})).status,'waiting');
  assert.deepEqual(JSON.parse(p.calls[0].options.body).directUrls,['https://www.instagram.com/p/Post_000/']);
  assert.equal(s.sqlite.prepare('SELECT starts_today FROM instagram_media_refresh').get().starts_today,1);
 }finally{s.sqlite.close();}
});
test('an explicitly failed requested post backs off without blocking other successful rows',async()=>{
 const s=await setup(2);try{
  const before=s.sqlite.prepare('SELECT data FROM instagram_review WHERE code=?').get('Post_001').data;
  const result=await complete(s,provider([row(),{inputUrl:'https://www.instagram.com/p/Post_001/',error:'Post not found'}]));
  assert.equal(result.status,'complete');assert.equal(result.updated,1);assert.equal(result.failed,1);
  assert.equal(JSON.parse(s.sqlite.prepare('SELECT data FROM instagram_review WHERE code=?').get('Post_000').data).images[0],url('one0','new'));
  assert.equal(s.sqlite.prepare('SELECT data FROM instagram_review WHERE code=?').get('Post_001').data,before);
  assert.equal(s.sqlite.prepare('SELECT last_error FROM instagram_media_refresh_posts WHERE code=?').get('Post_001').last_error,'provider_post_error');
 }finally{s.sqlite.close();}
});
test('dataset rejection diagnostics identify the guard without exposing provider text, URLs or tokens',async()=>{
 const scenarios=[
  {rows:{error:'secret-value'},error:'dataset_shape'},
  {rows:[row(),row()],error:'dataset_count:1:2'},
  {rows:[{...row(),shortCode:'Wrong_123'}],error:'dataset_identity:0:unrequested'},
  {count:2,rows:[row(),row()],error:'dataset_duplicate:Post_000'},
  {rows:[{...row(),timestamp:'not-a-date'}],error:'dataset_normalize:Post_000'},
  {rows:[{...row(),childPosts:[{type:'Image',displayUrl:'https://example.test/secret-value'}]}],error:'dataset_child_media:Post_000:1:0'},
  {rows:[{inputUrl:'https://example.test/secret-value',error:'secret-value'}],error:'dataset_error_identity:0:unmatched:other'},
  {rows:[{inputUrl:'https://www.instagram.com/reel/Post_000/',error:'secret-value'}],error:'dataset_error_identity:0:unmatched:requested_post_variant'},
  {rows:[{inputUrl:'https://instagram.com/p/Post_000',error:'secret-value'}],error:'dataset_error_identity:0:unmatched:requested_post_variant'},
  {rows:[{inputUrl:'https://www.instagram.com/p/Post_000/',shortCode:'Wrong_123',error:'secret-value'}],error:'dataset_error_identity:0:shortcode_mismatch'},
  {rows:[{inputUrl:'https://www.instagram.com/p/Post_000/',url:'https://www.instagram.com/reel/Post_000/',error:'secret-value'}],error:'dataset_error_identity:0:url_disagreement:requested_canonical:requested_post_variant'},
  {rows:[{...row(),error:{token:'secret-value'}}],error:'dataset_error_shape:Post_000'},
  {rows:[{...row(),shortCode:'secret-value\n'}],error:'dataset_identity:0:invalid'}
 ];
 for(const scenario of scenarios){const s=await setup(scenario.count??1);try{
  const before=s.sqlite.prepare('SELECT code,data FROM instagram_review ORDER BY code').all();
  const result=await complete(s,provider(scenario.rows));assert.equal(result.error,scenario.error);assert.equal(result.updated,0);
  assert.equal(s.sqlite.prepare('SELECT last_error FROM instagram_media_refresh').get().last_error,scenario.error);
  assert.deepEqual(s.sqlite.prepare('SELECT code,data FROM instagram_review ORDER BY code').all(),before);
  assert.equal(s.sqlite.prepare('SELECT COUNT(*) n FROM instagram_preview_urls').get().n,0);assert.ok(!JSON.stringify(result).includes('secret-value'));
 }finally{s.sqlite.close();}}
});

