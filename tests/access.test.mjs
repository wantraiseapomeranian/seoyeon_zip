import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.mjs';

test('all paths fail closed before Access is configured',async()=>{
  for(const path of ['/','/cards.js','/api/samples','/api/probe']) {
    const res=await worker.fetch(new Request('https://example.test'+path),{});
    assert.equal(res.status,503);
  }
});

test('forged identity header and malformed JWT cannot reach assets or data',async()=>{
  const env={TEAM_DOMAIN:'https://test.cloudflareaccess.com',POLICY_AUD:'aud',OWNER_EMAIL:'owner@example.test'};
  const forged=new Request('https://example.test/api/samples',{headers:{'cf-access-authenticated-user-email':'owner@example.test'}});
  assert.equal((await worker.fetch(forged,env)).status,401);
  const jwt=new Request('https://example.test/',{headers:{'cf-access-jwt-assertion':'not.a.valid.jwt'}});
  assert.equal((await worker.fetch(jwt,env)).status,403);
});
