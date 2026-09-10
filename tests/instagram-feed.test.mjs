import test from 'node:test';
import assert from 'node:assert/strict';
import {testDatabase} from './helpers/d1.mjs';
import {readFeed} from '../src/feed.mjs';
test('only kept Instagram photos enter mixed feed; exact X duplicates link to representative',async()=>{
 const {sqlite,DB}=testDatabase();try{
 const x={id:'x:1',authorHandle:'first',canonicalUrl:'https://x.com/first/status/1',publishedAt:'2026-09-10T00:00:00.000Z',media:[{kind:'image',previewUrl:'https://pbs.twimg.com/media/x.jpg'}]};sqlite.prepare('INSERT INTO posts VALUES (?,?)').run(x.id,JSON.stringify(x));
 for(const status of ['kept','pending','held','excluded'])sqlite.prepare('INSERT INTO instagram_review(code,data,status,imported_at) VALUES(?,?,?,?)').run(status+'123',JSON.stringify({author:'ig.author',url:'https://www.instagram.com/p/'+status+'123/',publishedAt:x.publishedAt,images:['https://a.cdninstagram.com/shared.jpg','https://a.cdninstagram.com/unique.jpg'],caption:'test'}),status,x.publishedAt);
 for(const url of [x.media[0].previewUrl,'https://a.cdninstagram.com/shared.jpg'])sqlite.prepare('INSERT INTO x_fingerprints(url,hash) VALUES(?,?)').run(url,'same');
 const all=await readFeed(DB,new URLSearchParams());assert.equal(all.total,2);const ig=all.posts.find(p=>p.platform==='instagram');assert.equal(ig.id,'ig:kept123');assert.equal(ig.media.length,1);assert.match(ig.media[0].previewUrl,/unique/);assert.ok(all.posts.find(p=>p.id==='x:1').duplicateSources.some(p=>p.url.includes('instagram.com')));
 assert.equal((await readFeed(DB,new URLSearchParams({source:'instagram'}))).total,1);
 sqlite.exec("UPDATE instagram_review SET status='held' WHERE status='kept'");assert.equal((await readFeed(DB,new URLSearchParams())).total,1);
 }finally{sqlite.close();}
});
test('Instagram cursor supports shortcode and ties across pages',async()=>{const {sqlite,DB}=testDatabase();try{for(let i=0;i<55;i++)sqlite.prepare('INSERT INTO instagram_review(code,data,status,imported_at) VALUES(?,?,?,?)').run('Code_'+i,JSON.stringify({author:'test',url:'https://www.instagram.com/p/Code_'+i+'/',images:['https://a.cdninstagram.com/'+i+'.jpg']}),'kept','2026-09-10T00:00:00.000Z');let p=await readFeed(DB,new URLSearchParams());assert.equal(p.posts.length,48);let q=await readFeed(DB,new URLSearchParams({cursor:p.nextCursor}));assert.equal(q.posts.length,7);assert.equal(new Set([...p.posts,...q.posts].map(x=>x.id)).size,55);}finally{sqlite.close();}});
test('maintenance fingerprints kept Instagram images without following redirects',async()=>{
 const {maintainX,fingerprint}=await import('../src/x-maintenance.mjs');const {sqlite,DB,enable}=testDatabase();const original=globalThis.fetch;let calls=0;
 try{enable();sqlite.prepare('INSERT INTO instagram_review(code,data,status,imported_at) VALUES(?,?,?,?)').run('Kept_123',JSON.stringify({images:['https://a.cdninstagram.com/a.jpg']}),'kept','2026-09-10');
 globalThis.fetch=async(u,options)=>{calls++;assert.equal(options.redirect,'manual');return new Response('same-image-bytes');};
 await maintainX({DB,COLLECTION_ENABLED:'true'});assert.equal(calls,1);assert.equal(sqlite.prepare('SELECT hash FROM x_fingerprints').get().hash.length,64);
 await assert.rejects(()=>fingerprint('https://cdninstagram.com.attacker.test/a.jpg'),/unsupported_image/);
 globalThis.fetch=async()=>new Response(null,{status:302});await assert.rejects(()=>fingerprint('https://a.cdninstagram.com/b.jpg'),/original_http_302/);
 }finally{globalThis.fetch=original;sqlite.close();}
});
