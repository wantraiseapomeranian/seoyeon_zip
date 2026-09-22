import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
import worker from '../src/worker.mjs';
import {testDatabase} from './helpers/d1.mjs';

const access={TEAM_DOMAIN:'https://operations-test.cloudflareaccess.com',POLICY_AUD:'operations',OWNER_EMAIL:'owner@example.test',PUBLIC_FEED_ENABLED:'true'};
test('operations API and every asset require owner; owner alias and API are read only',async t=>{
 const {sqlite,DB}=testDatabase();
 const keys=await generateKeyPair('RS256'),jwk={...await exportJWK(keys.publicKey),kid:'ops',alg:'RS256',use:'sig'};
 t.mock.method(globalThis,'fetch',async()=>Response.json({keys:[jwk]}));
 const token=await new SignJWT({email:access.OWNER_EMAIL}).setProtectedHeader({alg:'RS256',kid:'ops'}).setIssuer(access.TEAM_DOMAIN).setAudience(access.POLICY_AUD).setIssuedAt().setExpirationTime('5m').sign(keys.privateKey);
 let assets=0,assetPath;const env={...access,DB,ASSETS:{fetch:async req=>{assets++;assetPath=new URL(req.url).pathname;return new Response('operations');}}};
 try{
  for(const path of ['/api/admin/operations','/admin/operations','/admin/operations/','/operations.html','/operations.js','/operations.css']){
   assert.equal((await worker.fetch(new Request('https://test.local'+path),env)).status,401);
   assert.equal((await worker.fetch(new Request('https://test.local'+path,{headers:{'cf-access-jwt-assertion':'not.a.jwt'}}),env)).status,403);
  }
  assert.equal(assets,0);
  const headers={cookie:'CF_Authorization='+token};
  for(const path of ['/admin/operations','/admin/operations/']){
   const response=await worker.fetch(new Request('https://test.local'+path,{headers}),env);
   assert.equal(response.status,200);assert.equal(assetPath,'/operations.html');assert.equal(response.headers.get('cache-control'),'private, no-store');
  }
  const result=await worker.fetch(new Request('https://test.local/api/admin/operations',{headers}),env);
  assert.equal(result.status,200);assert.equal(result.headers.get('cache-control'),'private, no-store');assert.deepEqual((await result.json()).totals,{x:0,instagram:0,manual:0,youtube:0});
  assert.equal((await worker.fetch(new Request('https://test.local/api/admin/operations',{method:'POST',headers}),env)).status,405);
 }finally{sqlite.close();}
});
