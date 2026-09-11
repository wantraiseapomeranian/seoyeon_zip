import assert from 'node:assert/strict';
const origin=new URL(process.env.LOCAL_WORKER_URL||'http://127.0.0.1:4192');
assert.ok(['127.0.0.1','localhost'].includes(origin.hostname),'Only a local Worker may be tested');
for(const path of ['/','/feed.html','/feed']) {
 const response=await fetch(new URL(path,origin));assert.equal(response.status,200,path);assert.match(response.headers.get('content-type'),/text\/html/);
}
const session=await fetch(new URL('/api/session',origin));assert.equal(session.status,200);assert.deepEqual(await session.json(),{role:'visitor'});assert.equal(session.headers.get('cache-control'),'private, no-store');
const feed=await fetch(new URL('/api/feed',origin));assert.equal(feed.status,200);assert.ok(Array.isArray((await feed.json()).posts));
const status=await fetch(new URL('/api/collection-status',origin));assert.equal(status.status,200);const {sources}=await status.json();assert.ok(sources.length>0);for(const source of sources)assert.deepEqual(Object.keys(source).sort(),['lastSuccessAt','source','state']);
for(const path of ['/api/sources','/api/export','/api/samples','/api/admin/x','/api/admin/instagram','/admin','/admin/x','/instagram','/instagram.html','/x-review','/x-review.html','/index.html','/cards.js']) {
 const response=await fetch(new URL(path,origin),{redirect:'manual'});assert.equal(response.status,401,path);
}
for(const [path,method] of [['/api/sources/Seowoo_0501','PATCH'],['/api/sources/Seowoo_0501/retry','POST'],['/api/manual-posts','POST'],['/api/admin/x','POST'],['/api/admin/instagram','POST']]){
 const response=await fetch(new URL(path,origin),{method,headers:{origin:origin.origin,'content-type':'application/json','x-management-action':'manage','x-review-action':'review','x-validation-action':'collect'},body:'{}'});assert.equal(response.status,401,path);
}
const forged=await fetch(new URL('/api/sources',origin),{headers:{'cf-access-jwt-assertion':'not.a.valid.jwt'}});assert.equal(forged.status,403);
console.log('PASS: real local Worker canonical feed redirects, public reads, private aliases, all management mutations, forged JWT');
