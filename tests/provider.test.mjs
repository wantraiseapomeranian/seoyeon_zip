import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchPage } from '../src/collection.mjs';

test('provider failures expose structured status and Retry-After',async t=>{
  t.mock.method(globalThis,'fetch',async()=>new Response('private diagnostic',{status:429,headers:{'Retry-After':'120'}}));
  await assert.rejects(fetchPage('Seowoo_0501'),e=>e.status===429 && e.retryAfter==='120' && !e.message.includes('private diagnostic'));
});
test('204 is explicit and malformed or oversized bodies never become pages',async t=>{
  const mock=t.mock.method(globalThis,'fetch',async()=>new Response(null,{status:204}));
  assert.equal((await fetchPage('Seowoo_0501')).kind,'not-modified');
  mock.mock.mockImplementation(async()=>new Response('<html>bad</html>'));
  await assert.rejects(fetchPage('Seowoo_0501'),e=>e.code==='invalid_json');
  mock.mock.mockImplementation(async()=>Response.json({code:503}));
  await assert.rejects(fetchPage('Seowoo_0501'),e=>e.status===503);
  mock.mock.mockImplementation(async()=>new Response('x'.repeat(2097153)));
  await assert.rejects(fetchPage('Seowoo_0501'),e=>e.code==='response_too_large');
});

test('provider requests identify the app without relying on a runtime default User-Agent',async t=>{
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    const headers=new Headers(options.headers);
    if (!/^SeoyeonZip\//.test(headers.get('User-Agent') ?? '')) {
      return Response.json({error:'User-Agent required'},{status:401});
    }
    return Response.json({code:200,results:[],cursor:{bottom:null}});
  });
  const result=await fetchPage('Seowoo_0501');
  assert.equal(result.observation.http,200);
});

test('Workers-compatible redirect handling rejects redirects without following them',async t=>{
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    assert.equal(options.redirect,'manual');
    return new Response(null,{status:302,headers:{location:'https://example.test/other'}});
  });
  await assert.rejects(fetchPage('Seowoo_0501'),/HTTP 302/);
});

test('bounded provider response decodes Korean text and keeps string IDs',async t=>{
  const json={code:200,results:[{id:'2097494460074754382',text:'윤서연'}],cursor:{bottom:null}};
  t.mock.method(globalThis,'fetch',async()=>Response.json(json));
  const result=await fetchPage('Seowoo_0501');
  assert.deepEqual(result.json,json);
  assert.ok(result.observation.bytes>0);
});
