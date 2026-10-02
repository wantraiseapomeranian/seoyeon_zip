import test from 'node:test';
import assert from 'node:assert/strict';
import {testDatabase} from './helpers/d1.mjs';
import {importInstagram} from '../src/instagram-import.mjs';
import {refreshInstagramMedia} from '../src/instagram-media-refresh.mjs';
import {readFeed} from '../src/feed.mjs';
import {handleInstagramReview} from '../src/instagram-review.mjs';
import {instagramPreviewUrls} from '../src/instagram-preview-urls.mjs';
const code='Alias_123',source='https://scontent.cdninstagram.com/v/t51/one.jpg?oh=old&oe=abcd',second='https://scontent.cdninstagram.com/v/t51/two.jpg?oh=old&oe=abcd',preview='https://scontent.cdninstagram.com/v/t51/one.jpg?oh=new&oe=efgh&stp=crop';
async function setup(){
 const s=testDatabase();s.sqlite.function('unixepoch',()=>1780000000);
 await importInstagram(s.DB,[{shortCode:code,ownerUsername:'test.author',caption:'Original caption',timestamp:'2026-01-01',type:'Sidecar',childPosts:[{type:'Image',displayUrl:source},{type:'Image',displayUrl:second}]}]);
 s.sqlite.exec("UPDATE instagram_review SET status='kept',revision=7,reviewed_at='original'");
 s.sqlite.prepare('INSERT INTO x_fingerprints(url,hash,confirmed_hash) VALUES(?,?,?)').run(source,'original-hash','reviewed-hash');
 s.sqlite.prepare('INSERT INTO x_photo_differences(left_url,right_url) VALUES(?,?)').run(source,second);
 s.env={DB:s.DB,APIFY_TOKEN:'test-token',APIFY_SYNC_ENABLED:'true',INSTAGRAM_MEDIA_REFRESH_ENABLED:'true'};return s;
}
function replay(s,{mutate=()=>{},rows=null}={}){
 s.sqlite.prepare("UPDATE instagram_media_refresh SET state='waiting',run_id='Run123',codes_json=?,started_at=unixepoch(),starts_today=2,budget_day=CAST(unixepoch()/86400 AS INTEGER),next_due_at=0,lease_token=NULL,lease_until=0").run(JSON.stringify([code]));
 const calls=[];return {calls,fetcher:async(url,options)=>{calls.push(options.method);assert.equal(options.method,'GET');if(new URL(url).pathname.endsWith('/items')){mutate();return Response.json(rows??[{shortCode:code,ownerUsername:'test.author',type:'Sidecar',childPosts:[{type:'Image',displayUrl:preview},{type:'Image',displayUrl:second}]}]);}return Response.json({data:{id:'Run123',status:'SUCCEEDED',defaultDatasetId:'Data123'}});}};
}
test('changed rendition is a successful display alias while source metadata and evidence remain exact',async()=>{
 const s=await setup();try{
  s.sqlite.prepare('INSERT INTO x_fingerprints(url,hash,confirmed_hash) VALUES(?,?,?)').run(preview,'different-rendition-hash','different-reviewed-hash');
  const before=s.sqlite.prepare('SELECT * FROM instagram_review').get(),fingerprints=s.sqlite.prepare('SELECT * FROM x_fingerprints').all(),differences=s.sqlite.prepare('SELECT * FROM x_photo_differences').all();
  const p=replay(s),result=await refreshInstagramMedia(s.env,{fetcher:p.fetcher});
  assert.equal(result.status,'complete');assert.equal(result.updated,1);assert.equal(result.failed,0);assert.equal(result.aliased,1);
  assert.deepEqual(s.sqlite.prepare('SELECT * FROM instagram_review').get(),before);
  assert.deepEqual(s.sqlite.prepare('SELECT * FROM x_fingerprints').all(),fingerprints);
  assert.deepEqual(s.sqlite.prepare('SELECT * FROM x_photo_differences').all(),differences);
  assert.equal(s.sqlite.prepare('SELECT preview_url FROM instagram_preview_urls WHERE code=? AND source_url=?').get(code,source).preview_url,preview);
  const outcome=s.sqlite.prepare('SELECT failures,last_error,last_success_at,next_due_at FROM instagram_media_refresh_posts').get();assert.equal(outcome.failures,0);assert.equal(outcome.last_error,null);assert.equal(outcome.next_due_at,outcome.last_success_at+3*86400);
  assert.equal(s.sqlite.prepare('SELECT starts_today FROM instagram_media_refresh').get().starts_today,2);assert.deepEqual(p.calls,['GET','GET']);
 }finally{s.sqlite.close();}
});
test('feed and Instagram review display exact aliases without changing X or obsolete/current source keys',async()=>{
 const s=await setup();try{
  s.sqlite.prepare('INSERT INTO instagram_preview_urls(code,source_url,preview_url,updated_at) VALUES(?,?,?,unixepoch())').run(code,source,preview);
  s.sqlite.prepare('INSERT INTO instagram_preview_urls(code,source_url,preview_url,updated_at) VALUES(?,?,?,unixepoch())').run(code,'https://scontent.cdninstagram.com/obsolete.jpg','https://scontent.cdninstagram.com/unrelated.jpg');
  s.sqlite.prepare('INSERT INTO posts(id,data) VALUES(?,?)').run('x:1',JSON.stringify({id:'x:1',platform:'x',publishedAt:'2026-01-01',canonicalUrl:'https://x.com/test/status/1',media:[{kind:'image',previewUrl:source}]}));
  const feed=await readFeed(s.DB,new URLSearchParams()),ig=feed.posts.find(p=>p.id==='ig:'+code),x=feed.posts.find(p=>p.id==='x:1');
  assert.deepEqual(ig.media.map(m=>m.previewUrl),[preview,second]);assert.equal(x.media[0].previewUrl,source);
  const response=await handleInstagramReview(new Request('https://example.test/api/admin/instagram?status=kept'),s.env,{}),item=(await response.json()).items[0];
  assert.deepEqual(item.images,[preview,second]);assert.equal(item.image,preview);assert.deepEqual(item.media.map(m=>m.previewUrl),[preview,second]);assert.equal(item.revision,7);
  await importInstagram(s.DB,[{shortCode:code,ownerUsername:'test.author',type:'Sidecar',childPosts:[{type:'Image',displayUrl:'https://scontent.cdninstagram.com/newfile.jpg'},{type:'Image',displayUrl:'https://scontent.cdninstagram.com/newfile2.jpg'}]}]);
  const current=(await readFeed(s.DB,new URLSearchParams())).posts.find(p=>p.id==='ig:'+code);assert.ok(!current.media.some(m=>m.previewUrl===preview));
 }finally{s.sqlite.close();}
});
test('aliases preserve SQL duplicate suppression and do not expose hidden Instagram assets',async()=>{
 const s=await setup();try{
  s.sqlite.prepare('INSERT INTO instagram_preview_urls(code,source_url,preview_url,updated_at) VALUES(?,?,?,unixepoch())').run(code,source,preview);
  const xurl='https://pbs.twimg.com/media/duplicate.jpg';s.sqlite.prepare('INSERT INTO x_fingerprints(url,hash) VALUES(?,?)').run(xurl,'original-hash');
  s.sqlite.prepare('INSERT INTO posts(id,data) VALUES(?,?)').run('x:1',JSON.stringify({id:'x:1',platform:'x',publishedAt:'2026-01-01',media:[{kind:'image',previewUrl:xurl}]}));
  const feed=await readFeed(s.DB,new URLSearchParams());assert.deepEqual(feed.posts.find(p=>p.id==='ig:'+code).media.map(m=>m.previewUrl),[second]);
  s.sqlite.exec("UPDATE instagram_review SET status='excluded',revision=8");assert.ok(!(await readFeed(s.DB,new URLSearchParams())).posts.some(p=>p.id==='ig:'+code));
 }finally{s.sqlite.close();}
});
test('alias storage and completion roll back together on save failure or moderation/import/lease conflict',async()=>{
 for(const mutation of ["UPDATE instagram_review SET status='excluded',revision=8","UPDATE instagram_review SET data=json_set(data,'$.caption','Concurrent import')","UPDATE instagram_media_refresh SET lease_token='other-owner'"]){const s=await setup();try{const p=replay(s,{mutate:()=>s.sqlite.exec(mutation)});assert.equal((await refreshInstagramMedia(s.env,{fetcher:p.fetcher})).status,'retry');assert.equal(s.sqlite.prepare('SELECT COUNT(*) n FROM instagram_preview_urls').get().n,0);}finally{s.sqlite.close();}}
 const s=await setup();try{s.sqlite.exec("CREATE TRIGGER fail_alias BEFORE UPDATE OF last_success_at ON instagram_media_refresh BEGIN SELECT RAISE(ABORT,'injected'); END");const p=replay(s);assert.equal((await refreshInstagramMedia(s.env,{fetcher:p.fetcher})).status,'retry');assert.equal(s.sqlite.prepare('SELECT COUNT(*) n FROM instagram_preview_urls').get().n,0);assert.equal(s.sqlite.prepare('SELECT state FROM instagram_media_refresh').get().state,'waiting');}finally{s.sqlite.close();}
});
test('late evidence remains on the source URL when a different rendition is stored as alias',async()=>{
 const s=await setup();try{
  s.sqlite.exec('DELETE FROM x_fingerprints; DELETE FROM x_photo_differences');const batch=s.DB.batch.bind(s.DB);let injected=false;
  s.DB.batch=async statements=>{if(!injected&&statements.some(q=>q.sql.includes('INSERT INTO instagram_preview_urls'))){injected=true;s.sqlite.prepare('INSERT INTO x_fingerprints(url,hash,confirmed_hash) VALUES(?,?,?)').run(source,'late-hash','late-reviewed');}return batch(statements);};
  const p=replay(s);assert.equal((await refreshInstagramMedia(s.env,{fetcher:p.fetcher})).status,'complete');
  assert.equal(s.sqlite.prepare('SELECT hash FROM x_fingerprints WHERE url=?').get(source).hash,'late-hash');assert.equal(s.sqlite.prepare('SELECT COUNT(*) n FROM x_fingerprints').get().n,1);
  assert.equal(JSON.parse(s.sqlite.prepare('SELECT data FROM instagram_review').get().data).image,source);assert.equal((await readFeed(s.DB,new URLSearchParams())).posts[0].media[0].previewUrl,preview);
 }finally{s.sqlite.close();}
});
test('resolver query contains only current automatic Instagram code/source pairs',async()=>{
 const s=await setup();try{
  s.sqlite.prepare('INSERT INTO instagram_preview_urls(code,source_url,preview_url,updated_at) VALUES(?,?,?,unixepoch())').run(code,source,preview);
  const captured=[],prepare=s.DB.prepare.bind(s.DB);s.DB.prepare=sql=>{const q=prepare(sql);if(!sql.includes('JOIN instagram_preview_urls'))return q;const bind=q.bind.bind(q);q.bind=(...args)=>{captured.push(JSON.parse(args[0]));return bind(...args);};return q;};
  const posts=[{id:'ig:'+code,platform:'instagram',media:[{kind:'image',previewUrl:source}]},{id:'x:1',platform:'x',media:[{kind:'image',previewUrl:source}]},{id:'manual:ig:'+code,platform:'instagram',media:[{kind:'image',previewUrl:source}]}];
  const resolved=await instagramPreviewUrls(s.DB,posts);assert.deepEqual(captured,[[{code,source}]]);
  assert.deepEqual(resolved.map(p=>p.media[0].previewUrl),[preview,source,source]);assert.equal(posts[0].media[0].previewUrl,source);
 }finally{s.sqlite.close();}
});
test('a later same-source result supersedes an obsolete display alias without paid restart',async()=>{
 const s=await setup();try{
  const first=replay(s);await refreshInstagramMedia(s.env,{fetcher:first.fetcher});
  const p=replay(s,{rows:[{shortCode:code,ownerUsername:'test.author',type:'Sidecar',childPosts:[{type:'Image',displayUrl:source},{type:'Image',displayUrl:second}]}]});
  assert.equal((await refreshInstagramMedia(s.env,{fetcher:p.fetcher})).status,'complete');
  assert.equal(s.sqlite.prepare('SELECT COUNT(*) n FROM instagram_preview_urls').get().n,0);assert.deepEqual(p.calls,['GET','GET']);
  assert.equal((await readFeed(s.DB,new URLSearchParams())).posts[0].media[0].previewUrl,source);
 }finally{s.sqlite.close();}
});
