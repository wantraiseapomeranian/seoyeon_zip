import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
if(process.argv[2]!=='--local')throw Error('Use --local; never connects to a remote DB.');
const bundle=await build({stdin:{contents:"import {handleApi} from './src/worker.mjs';export default {fetch:(r,env)=>handleApi(r,env)}",resolveDir:process.cwd()},bundle:true,format:'esm',platform:'neutral',conditions:['workerd','worker','browser'],external:['node:*'],write:false});
const mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:'feed-batch-validation',modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-09-09',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],outboundService:()=>{throw Error('No external requests allowed');}}]}));
try{
 const DB=await mf.getD1Database('DB');
 // Minimal SQL fixture schema. Full production views and visibility rules are covered by feed.test.mjs.
 await DB.batch([
  DB.prepare('CREATE TABLE managed_feed_posts(id TEXT PRIMARY KEY,data TEXT)'),DB.prepare('CREATE TABLE posts(id TEXT PRIMARY KEY,data TEXT)'),
  DB.prepare('CREATE TABLE collection_state(last_success_at INTEGER)'),DB.prepare('CREATE TABLE x_photo_rows(id TEXT,hash TEXT,rank INTEGER)'),DB.prepare('CREATE TABLE instagram_photo_rows(hash TEXT,data TEXT)')
 ]);
 await DB.batch(Array.from({length:51},(_,i)=>DB.prepare('INSERT INTO managed_feed_posts VALUES(?,?)').bind('x:'+(100+i),JSON.stringify({id:'x:'+(100+i),publishedAt:'2026-09-22T00:00:00Z',media:[{kind:'image'}]}))));
 await DB.prepare('INSERT INTO collection_state VALUES(1000)').run();
 const response=await mf.dispatchFetch('https://fixture.test/api/feed?media=image');assert.equal(response.status,200);const first=await response.json();assert.equal(first.total,51);assert.equal(first.posts.length,48);assert.equal(first.collectedAt,'1970-01-01T00:16:40.000Z');
 const second=await (await mf.dispatchFetch('https://fixture.test/api/feed?'+new URLSearchParams({media:'image',cursor:first.nextCursor}))).json();assert.equal(second.total,51);assert.equal(second.posts.length,3);assert.equal(second.nextCursor,null);
 const empty=await (await mf.dispatchFetch('https://fixture.test/api/feed?media=video')).json();assert.equal(empty.total,0);assert.deepEqual(empty.posts,[]);
 assert.equal((await mf.dispatchFetch('https://fixture.test/api/feed?cursor=invalid')).status,400);
 await DB.prepare('DROP TABLE instagram_photo_rows').run();assert.equal((await mf.dispatchFetch('https://fixture.test/api/feed?media=image')).status,500);
 console.log('PASS local workerd/D1: SELECT batch results, 48+3 pagination, total, timestamp, empty state, invalid cursor and batch error mapping.');
}finally{await mf.dispose();}
