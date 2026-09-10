import test from 'node:test';
import assert from 'node:assert/strict';
import {testDatabase} from './helpers/d1.mjs';
import {readFeed} from '../src/feed.mjs';
import {reviewReason} from '../src/x-policy.mjs';
import {checkOriginal,maintainX} from '../src/x-maintenance.mjs';
import {handleXReview} from '../src/x-review.mjs';
test('origin guard and revision prevent unauthorized or stale review writes',async()=>{
 const {sqlite,DB}=testDatabase();sqlite.prepare('INSERT INTO posts VALUES(?,?)').run('x:1',JSON.stringify({id:'x:1',caption:'서연',publishedAt:'2026-09-01',media:[]}));
 const request=(revision,origin='https://test.local')=>new Request('https://test.local/api/admin/x',{method:'POST',headers:{origin,'content-type':'application/json','x-review-action':'review'},body:JSON.stringify({id:'x:1',decision:'hidden',revision})});
 assert.equal((await handleXReview(request(0,'https://evil.test'),{DB})).status,403);
 assert.equal((await handleXReview(request(0),{DB})).status,200);
 assert.equal((await handleXReview(request(0),{DB})).status,409);sqlite.close();
});
test('404 requires provider not-found payload; transient failure preserves availability and decisions',async()=>{
 const original=globalThis.fetch;const {sqlite,DB}=testDatabase();
 const post={id:'x:1',platformPostId:'1',canonicalUrl:'https://x.com/test/status/1',caption:'서연',media:[]};sqlite.prepare('INSERT INTO posts VALUES(?,?)').run(post.id,JSON.stringify(post));
 try{
 globalThis.fetch=async()=>Response.json({code:404,message:'NOT_FOUND',tweet:null},{status:404});assert.equal(await checkOriginal(post),'missing');
 sqlite.exec("UPDATE collection_control SET enabled=1; INSERT INTO x_quality(post_id,decision,availability) VALUES('x:1','hidden','missing');");
 globalThis.fetch=async()=>new Response('rate limited',{status:429});await maintainX({DB,COLLECTION_ENABLED:'true'});
 assert.equal(sqlite.prepare('SELECT availability FROM x_quality').get().availability,'missing');assert.equal(sqlite.prepare('SELECT decision FROM x_quality').get().decision,'hidden');
 globalThis.fetch=async()=>Response.json({code:200,tweet:{id:'1'}});assert.equal(await checkOriginal(post),'available');
 }finally{globalThis.fetch=original;sqlite.close();}
});
test('notice and mascot go to review but ordinary COSMO remains',()=>{
 assert.ok(reviewReason('tripleS MEET & VIDEO CALL EVENT 서연 응모기간'));
 assert.ok(reviewReason('to attend Cheonan College Festival, Seoyeon'));
 assert.ok(reviewReason('tripleS Official Characters byteS S1 서연'));
 assert.equal(reviewReason('260902 Cosmo Talk 서연'),null);
});
test('hidden posts and duplicate photos do not leak into feed; unique second photo survives',async()=>{
 const {sqlite,DB}=testDatabase();
 for(const [id,urls] of [['1',['a']],['2',['a','b']],['3',['c']]])sqlite.prepare('INSERT INTO posts VALUES(?,?)').run('x:'+id,JSON.stringify({id:'x:'+id,publishedAt:'2026-09-01T00:00:00Z',media:urls.map(previewUrl=>({kind:'image',previewUrl}))}));
 const tables=sqlite.prepare("SELECT name FROM sqlite_master WHERE name='x_quality'").get();
 if(tables){sqlite.exec("INSERT INTO x_quality(post_id,decision) VALUES('x:3','hidden'); INSERT INTO x_fingerprints(url,hash) VALUES('a','same');");}
 const result=await readFeed(DB,new URLSearchParams());assert.equal(result.total,2);assert.equal(result.posts.find(p=>p.id==='x:2').media.length,1);sqlite.close();
});

test('stale merge and unmerge roll back without changing newer groups',async()=>{
 const {sqlite,DB}=testDatabase();sqlite.exec("INSERT INTO x_fingerprints(url,hash) VALUES('a','a'),('b','b'),('c','c')");
 const send=body=>handleXReview(new Request('https://test.local/api/admin/x',{method:'POST',headers:{origin:'https://test.local','content-type':'application/json','x-review-action':'review'},body:JSON.stringify(body)}),{DB});
 assert.equal((await send({action:'merge',left:'a',right:'b',groupRevision:0})).status,200);
 const before=sqlite.prepare('SELECT * FROM x_fingerprints ORDER BY url').all();
 assert.equal((await send({action:'unmerge',image:'a',groupRevision:0})).status,409);
 assert.equal((await send({action:'merge',left:'b',right:'c',groupRevision:0})).status,409);
 assert.deepEqual(sqlite.prepare('SELECT * FROM x_fingerprints ORDER BY url').all(),before);
 assert.equal((await send({action:'merge',left:'b',right:'c',groupRevision:1})).status,200);
 assert.equal(sqlite.prepare('SELECT COUNT(DISTINCT confirmed_hash) AS n FROM x_fingerprints').get().n,1);
 sqlite.close();
});

test('maintenance requests reject redirects using Workers supported manual mode',async t=>{
 t.mock.method(globalThis,'fetch',async(url,options)=>{assert.equal(options.redirect,'manual');return new Response(null,{status:302,headers:{location:'https://example.test'}});});
 const {fingerprint}=await import('../src/x-maintenance.mjs');
 await assert.rejects(fingerprint('https://pbs.twimg.com/media/example.jpg'),/original_http_302/);
 assert.equal(await checkOriginal({canonicalUrl:'https://x.com/test/status/1',platformPostId:'1'}),'retry');
});
