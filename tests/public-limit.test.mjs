import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.mjs';
import {readFeed} from '../src/feed.mjs';

const access={TEAM_DOMAIN:'https://test.cloudflareaccess.com',POLICY_AUD:'aud',OWNER_EMAIL:'owner@example.test'};
test('public API limits reject before database or session authentication work',async()=>{
  const keys=[];
  const env={...access,PUBLIC_FEED_ENABLED:'true',DB:{prepare(){assert.fail('DB must not be touched');}},PUBLIC_RATE_LIMITER:{async limit({key}){keys.push(key);return {success:false};}}};
  for(const path of ['/api/feed?cursor=bad','/api/collection-status','/api/session']){
    const r=await worker.fetch(new Request('https://example.test'+path,{headers:{'CF-Connecting-IP':'192.0.2.1','X-Forwarded-For':'different','cookie':'CF_Authorization=bad'}}),env);
    assert.equal(r.status,429);assert.equal(r.headers.get('Retry-After'),'60');assert.match(r.headers.get('Cache-Control'),/no-store/);
    assert.deepEqual(await r.json(),{error:'rate_limited'});
  }
  assert.equal(new Set(keys).size,1);assert.match(keys[0],/192\.0\.2\.1$/);
});
test('missing or unavailable limit service fails closed only for public APIs',async()=>{
  for(const limiter of [undefined,{limit:async()=>{throw Error('unavailable');}}]){
    const env={...access,PUBLIC_FEED_ENABLED:'true',PUBLIC_RATE_LIMITER:limiter,ASSETS:{fetch:async()=>new Response('asset')}};
    assert.equal((await worker.fetch(new Request('https://example.test/api/feed'),env)).status,503);
    assert.equal((await worker.fetch(new Request('https://example.test/feed'),env)).status,200);
    assert.equal((await worker.fetch(new Request('https://example.test/api/sources'),env)).status,401);
    assert.equal((await worker.fetch(new Request('https://example.test/api/feed'),{...env,PUBLIC_FEED_ENABLED:'false'})).status,401);
  }
});
test('allowed requests proceed and missing IP uses one shared bucket',async()=>{
  const keys=[];const env={...access,PUBLIC_FEED_ENABLED:'true',PUBLIC_RATE_LIMITER:{async limit({key}){keys.push(key);return {success:true};}}};
  for(const headers of [{},{'X-Forwarded-For':'192.0.2.2'},{'CF-Connecting-IP':'192.0.2.3'}]){
    const r=await worker.fetch(new Request('https://example.test/api/session',{headers}),env);
    assert.equal(r.status,200);assert.deepEqual(await r.json(),{role:'visitor'});
  }
  assert.equal(keys[0],keys[1]);assert.notEqual(keys[0],keys[2]);
});
test('invalid cursor is rejected before any database query',async()=>{
  let calls=0;const db={prepare(){calls++;throw Error('unexpected database access');}};
  for(const cursor of ['bad','a'.repeat(2049),btoa(JSON.stringify({scope:'wrong',id:'x:1',date:'2026-09-10'}))]){
    await assert.rejects(readFeed(db,new URLSearchParams({cursor})),{status:400});
  }
  assert.equal(calls,0);
});
