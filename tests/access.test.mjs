import test from 'node:test';
import assert from 'node:assert/strict';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import worker, { authorize } from '../src/worker.mjs';
import { verifyOwnerToken } from '../src/access.mjs';
import * as access from '../src/access.mjs';

const accessEnv = {TEAM_DOMAIN:'https://test.cloudflareaccess.com',POLICY_AUD:'aud',OWNER_EMAIL:'owner@example.test'};
const keys = await generateKeyPair('RS256');
const jwk = {...(await exportJWK(keys.publicKey)),kid:'test-key',alg:'RS256',use:'sig'};
const localKeyResolver = async () => keys.publicKey;

async function signedToken(overrides={}) {
  const now=Math.floor(Date.now()/1000);
  return new SignJWT({email:'owner@example.test',aud:'aud',iss:accessEnv.TEAM_DOMAIN,iat:now,exp:now+300,...overrides})
    .setProtectedHeader({alg:'RS256',kid:jwk.kid}).sign(keys.privateKey);
}

function spies() {
  let assets=0,db=0;
  return {env:{...accessEnv,PUBLIC_FEED_ENABLED:'true',PUBLIC_RATE_LIMITER:{limit:async()=>({success:true})},ASSETS:{fetch:async()=>{assets++;return new Response('asset');}},DB:{prepare:()=>{db++;throw new Error('unexpected database access');}}},counts:()=>({assets,db})};
}

test('owner context is created only after token verification and canonicalizes configured email',async()=>{
  assert.equal(typeof access.authorizeOwnerContext,'function');
  const request=new Request('https://example.test',{headers:{'cf-access-jwt-assertion':await signedToken(),email:'attacker@example.test'}});
  assert.deepEqual(await access.authorizeOwnerContext(request,{...accessEnv,OWNER_EMAIL:'Owner@Example.Test'},localKeyResolver),{status:200,actor:{id:'owner@example.test'}});
  assert.deepEqual(await access.authorizeOwnerContext(new Request('https://example.test'),accessEnv,localKeyResolver),{status:401});
  assert.deepEqual(await access.authorizeOwnerContext(new Request('https://example.test',{headers:{'cf-access-jwt-assertion':await signedToken({email:'other@example.test'})}}),accessEnv,localKeyResolver),{status:403});
});

test('audit routes and all static history aliases remain private in public mode',async()=>{
  for(const path of ['/api/admin/review-audit','/api/admin/review-audit/event','/admin/review-history','/admin/review-history/','/review-history','/review-history.html','/review-history.js','/review-history.css','/review-decision.js']) {
    const {env,counts}=spies();
    assert.equal((await worker.fetch(new Request(`https://example.test${path}`),env)).status,401,path);
    assert.equal((await worker.fetch(new Request(`https://example.test${path}`,{headers:{'cf-access-jwt-assertion':'forged'}}),env)).status,403,path);
    assert.deepEqual(counts(),{assets:0,db:0});
  }
});

test('all paths remain private when PUBLIC_FEED_ENABLED is absent or not exactly true',async()=>{
  for(const flag of [undefined,'TRUE','1',' true']) for(const path of ['/','/api/feed']) {
    const {env,counts}=spies();env.PUBLIC_FEED_ENABLED=flag;
    const response=await worker.fetch(new Request(`https://example.test${path}`),env);
    assert.equal(response.status,401,`${flag}:${path}`);assert.deepEqual(counts(),{assets:0,db:0});
  }
});

test('public mode permits only the exact asset method and path allowlist',async()=>{
  for(const method of ['GET','HEAD']) for(const path of ['/','/feed','/feed.html','/feed.css','/feed.js','/review-gallery.js','/favicon.ico','/favicon-16.png','/favicon-32.png']) {
    const {env,counts}=spies();const response=await worker.fetch(new Request(`https://example.test${path}`,{method}),env);
    assert.equal(response.status,200,`${method} ${path}`);assert.deepEqual(counts(),{assets:1,db:0});
  }
  for(const path of ['/api/export','/api/sources','/api/samples','/admin/x','/admin/instagram','/instagram.html','/instagram','/x-review.html','/x-review','/index.html','/cards.js']) {
    const {env,counts}=spies();const response=await worker.fetch(new Request(`https://example.test${path}`),env);
    assert.equal(response.status,401,path);assert.deepEqual(counts(),{assets:0,db:0});
  }
  for(const [method,path] of [['HEAD','/api/feed'],['POST','/api/session'],['GET','/unknown']]) {
    const {env,counts}=spies();const response=await worker.fetch(new Request(`https://example.test${path}`,{method}),env);
    assert.equal(response.status,401,`${method} ${path}`);assert.deepEqual(counts(),{assets:0,db:0});
  }
  for(const [method,path] of [['POST','/api/sources/abc/retry'],['PATCH','/api/sources/abc'],['POST','/api/manual-posts'],['POST','/api/admin/instagram/approve'],['POST','/api/admin/x']]) {
    const {env,counts}=spies();const response=await worker.fetch(new Request(`https://example.test${path}`,{method}),env);
    assert.equal(response.status,401,`${method} ${path}`);assert.deepEqual(counts(),{assets:0,db:0});
  }
});

test('verifyOwnerToken enforces owner identity and Access JWT claims',async()=>{
  assert.equal(await verifyOwnerToken(await signedToken(),accessEnv,localKeyResolver),200);
  for(const token of [await signedToken({email:'other@example.test'}),await signedToken({email:7}),await signedToken({aud:'wrong'}),await signedToken({iss:'https://wrong.cloudflareaccess.com'}),await signedToken({exp:Math.floor(Date.now()/1000)-1}),`${await signedToken()}x`])
    assert.equal(await verifyOwnerToken(token,accessEnv,localKeyResolver),403);
});

test('authorize prefers the JWT header, otherwise accepts exactly one auth cookie',async()=>{
  const valid=await signedToken();
  assert.equal(await authorize(new Request('https://example.test',{headers:{'cf-access-jwt-assertion':valid}}),accessEnv,localKeyResolver),200);
  assert.equal(await authorize(new Request('https://example.test',{headers:{cookie:`CF_Authorization=${valid}`}}),accessEnv,localKeyResolver),200);
  assert.equal(await authorize(new Request('https://example.test',{headers:{'cf-access-jwt-assertion':'bad',cookie:`CF_Authorization=${valid}`}}),accessEnv,localKeyResolver),403);
  assert.equal(await authorize(new Request('https://example.test',{headers:{cookie:`CF_Authorization=${valid}; CF_Authorization=${valid}`}}),accessEnv,localKeyResolver),401);
  assert.equal(await authorize(new Request('https://example.test',{headers:{cookie:'CF_Authorization='}}),accessEnv,localKeyResolver),401);
});

test('configuration and JWKS failures return 503 while malformed tokens return 403',async()=>{
  const token=await signedToken();
  assert.equal(await authorize(new Request('https://example.test'),{}),503);
  assert.equal(await authorize(new Request('https://example.test',{headers:{'cf-access-jwt-assertion':token}}),accessEnv,async()=>{throw new Error('network');}),503);
  assert.equal(await authorize(new Request('https://example.test',{headers:{'cf-access-jwt-assertion':'not.a.jwt'}}),accessEnv,localKeyResolver),403);
});

test('public session reports visitor for absent or invalid credentials',async()=>{
  for(const headers of [{},{'cf-access-jwt-assertion':'not.a.jwt'}]) {
    const {env,counts}=spies();const response=await worker.fetch(new Request('https://example.test/api/session',{headers}),env);
    assert.equal(response.status,200);assert.deepEqual(await response.json(),{role:'visitor'});assert.equal(response.headers.get('cache-control'),'private, no-store');assert.deepEqual(counts(),{assets:0,db:0});
  }
});

test('public session reports owner and authenticated admin reaches assets through remote JWKS',async()=>{
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async(input,init)=>String(input)===`${accessEnv.TEAM_DOMAIN}/cdn-cgi/access/certs`?Response.json({keys:[jwk]}):originalFetch(input,init);
  try {
    const token=await signedToken();const {env,counts}=spies();
    const session=await worker.fetch(new Request('https://example.test/api/session',{headers:{'cf-access-jwt-assertion':token}}),env);
    assert.equal(session.status,200);assert.deepEqual(await session.json(),{role:'owner'});
    const admin=await worker.fetch(new Request('https://example.test/admin/x',{headers:{'cf-access-jwt-assertion':token}}),env);
    assert.equal(admin.status,200);assert.deepEqual(counts(),{assets:1,db:0});
  } finally { globalThis.fetch=originalFetch; }
});

test('private mode owner can read session through the worker',async()=>{
  const originalFetch=globalThis.fetch;globalThis.fetch=async input=>String(input)===`${accessEnv.TEAM_DOMAIN}/cdn-cgi/access/certs`?Response.json({keys:[jwk]}):originalFetch(input);
  try {
    const response=await worker.fetch(new Request('https://example.test/api/session',{headers:{'cf-access-jwt-assertion':await signedToken()}}),{...accessEnv,PUBLIC_FEED_ENABLED:'false'});
    assert.equal(response.status,200);assert.deepEqual(await response.json(),{role:'owner'});assert.equal(response.headers.get('cache-control'),'private, no-store');
  } finally {globalThis.fetch=originalFetch;}
});

test('verified owner reaches audit reads and protected history asset alias',async t=>{
  const {testDatabase}=await import('./helpers/d1.mjs');const {sqlite,DB}=testDatabase();
  t.mock.method(globalThis,'fetch',async()=>Response.json({keys:[jwk]}));
  try {
    const headers={'cf-access-jwt-assertion':await signedToken()};let fetchedPath;
    const env={...accessEnv,PUBLIC_FEED_ENABLED:'true',DB,ASSETS:{fetch:async request=>{fetchedPath=new URL(request.url).pathname;return new Response('history');}}};
    const list=await worker.fetch(new Request('https://example.test/api/admin/review-audit',{headers}),env);
    assert.equal(list.status,200);assert.deepEqual((await list.json()).items,[]);
    for(const path of ['/admin/review-history','/admin/review-history/']) {
      const asset=await worker.fetch(new Request('https://example.test'+path,{headers}),env);
      assert.equal(asset.status,200);assert.equal(fetchedPath,'/review-history.html');assert.equal(asset.headers.get('cache-control'),'private, no-store');
    }
  }finally{sqlite.close();}
});

test('public session does not downgrade missing configuration or JWKS failure to visitor',async()=>{
  const response=await worker.fetch(new Request('https://example.test/api/session'),{PUBLIC_FEED_ENABLED:'true',PUBLIC_RATE_LIMITER:{limit:async()=>({success:true})}});
  assert.equal(response.status,503);
  const originalFetch=globalThis.fetch;globalThis.fetch=async()=>{throw new TypeError('network unavailable');};
  try {
    const failed=await worker.fetch(new Request('https://example.test/api/session',{headers:{'cf-access-jwt-assertion':await signedToken()}}),{...accessEnv,PUBLIC_FEED_ENABLED:'true',PUBLIC_RATE_LIMITER:{limit:async()=>({success:true})}});
    assert.equal(failed.status,503);
  } finally {globalThis.fetch=originalFetch;}
});

test('/admin and /admin/ redirect authenticated owners to root',async()=>{
  const originalFetch=globalThis.fetch;globalThis.fetch=async input=>String(input)===`${accessEnv.TEAM_DOMAIN}/cdn-cgi/access/certs`?Response.json({keys:[jwk]}):originalFetch(input);
  try { const valid=await signedToken();for(const path of ['/admin','/admin/']) {
    const response=await worker.fetch(new Request(`https://example.test${path}`,{headers:{'cf-access-jwt-assertion':valid}}),{...accessEnv,ASSETS:{fetch:async()=>new Response('unexpected')}});
    assert.equal(response.status,302);assert.equal(response.headers.get('location'),'https://example.test/');assert.equal(response.headers.get('cache-control'),'private, no-store');
  }} finally {globalThis.fetch=originalFetch;}
});

test('verified owner cookie reaches management while Origin and revision still guard writes',async t=>{
 const {testDatabase}=await import('./helpers/d1.mjs');const {sqlite,DB,enable}=testDatabase();enable();
 t.mock.method(globalThis,'fetch',async input=>{assert.equal(String(input),`${accessEnv.TEAM_DOMAIN}/cdn-cgi/access/certs`);return Response.json({keys:[jwk]});});
 try{
  const token=await signedToken();const env={...accessEnv,PUBLIC_FEED_ENABLED:'true',PUBLIC_RATE_LIMITER:{limit:async()=>({success:true})},COLLECTION_ENABLED:'true',DB};
  const source='Seowoo_0501';const before=sqlite.prepare('SELECT enabled,revision FROM collection_state WHERE source=?').get(source);
  const send=origin=>worker.fetch(new Request('https://example.test/api/sources/'+source,{method:'PATCH',headers:{origin,cookie:`CF_Authorization=${token}`,'content-type':'application/json','x-management-action':'manage'},body:JSON.stringify({enabled:false,revision:before.revision})}),env);
  assert.equal((await send('https://other.test')).status,403);
  assert.deepEqual(sqlite.prepare('SELECT enabled,revision FROM collection_state WHERE source=?').get(source),before);
  assert.equal((await send('https://example.test')).status,200);
  assert.equal(sqlite.prepare('SELECT enabled FROM collection_state WHERE source=?').get(source).enabled,0);
  assert.equal((await send('https://example.test')).status,409);
 }finally{sqlite.close();}
});
