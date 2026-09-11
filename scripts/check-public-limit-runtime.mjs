import assert from 'node:assert/strict';
const origin=new URL(process.env.TEST_ORIGIN||'http://127.0.0.1:4192');
if(!['127.0.0.1','localhost'].includes(origin.hostname))throw Error('Local runtime only');
let blocked=false,attempts=0;
for(;attempts<90;attempts++){
  const response=await fetch(new URL('/api/session',origin));
  if(response.status===429){blocked=true;break;}
  assert.equal(response.status,200);assert.deepEqual(await response.json(),{role:'visitor'});
}
assert.ok(blocked,'Local rate limiter must block the burst');
for(const path of ['/api/feed','/api/collection-status','/api/session']){
  const response=await fetch(new URL(path,origin));
  assert.equal(response.status,429,path);assert.equal(response.headers.get('retry-after'),'60');
  assert.deepEqual(await response.json(),{error:'rate_limited'});
}
assert.equal((await fetch(new URL('/feed',origin))).status,200);
assert.equal((await fetch(new URL('/api/sources',origin))).status,401);
console.log(`PASS: local rate binding blocked burst after ${attempts} allowed requests; all three APIs share limit; assets and admin authentication unaffected`);
