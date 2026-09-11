import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { testDatabase } from './helpers/d1.mjs';
import worker, { handleApi as rawHandleApi } from '../src/worker.mjs';

const handleApi=(request,env)=>rawHandleApi(request,env,{actor:{id:'owner@example.test'}});
const base='https://example.test';
const record={shortCode:'Example_123',caption:'윤서연 tripleS',ownerUsername:'example',timestamp:'2026-09-10T00:00:00Z',displayUrl:'https://scontent.cdninstagram.com/photo.jpg'};
function req(path,body,headers={}) {return new Request(base+'/api/admin/instagram'+path,{method:body?'POST':'GET',headers:{origin:base,'content-type':'application/json','x-review-action':'review',...headers},...(body?{body:JSON.stringify(Array.isArray(body)?body:{...body,requestId:crypto.randomUUID(),reasonCode:({kept:'SEOYEON_CONFIRMED',excluded:'NOT_SEOYEON',held:'NEEDS_REVIEW',pending:'NEEDS_REVIEW'})[body.status]??'OTHER'})}:{})});}
test('review endpoints reject unauthenticated callers before touching data',async()=>{
  const env={TEAM_DOMAIN:'https://test.cloudflareaccess.com',POLICY_AUD:'aud',OWNER_EMAIL:'owner@example.test'};
  for(const path of ['/admin/instagram','/api/admin/instagram','/api/admin/instagram/import']) {
    assert.equal((await worker.fetch(new Request(base+path),env)).status,401);
  }
});
test('import and decisions preserve manual review across duplicates; stale writes conflict',async()=>{
  const {sqlite,DB}=testDatabase();
  // New migration is optional here so the first run fails on missing behavior, not missing file.

  const env={DB};
  assert.equal((await handleApi(req('/import',[record]),env)).status,200);
  let data=await (await handleApi(req(''),env)).json();
  assert.equal(data.items[0].status,'pending');
  assert.equal((await handleApi(req('/Example_123',{status:'kept',revision:0}),env)).status,200);
  assert.equal((await handleApi(req('/import',[record,record]),env)).status,200);
  data=await (await handleApi(req('?status=kept'),env)).json();
  assert.equal(data.items.length,1);
  assert.equal(data.items[0].status,'kept');
  assert.equal((await handleApi(req('/Example_123',{status:'excluded',revision:0}),env)).status,409);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM posts').get().n,0);
  assert.equal((await handleApi(req('/import',[record],{origin:'https://evil.test'}),env)).status,403);
  assert.equal((await handleApi(req('/import',[record,{shortCode:'bad<script>'}]),env)).status,400);
  assert.equal((await handleApi(req('/Example_123',{status:'published',revision:1}),env)).status,400);
  sqlite.close();
});

test('imports all safe carousel images and keeps them during summary-only reimport',async()=>{
 const {sqlite,DB}=testDatabase();
 await handleApi(req('/import',[{...record,childPosts:[{displayUrl:record.displayUrl},{displayUrl:'https://scontent.cdninstagram.com/two.jpg'},{displayUrl:'https://evil.test/no.jpg'}]}]),{DB});
 let data=await (await handleApi(req(''),{DB})).json();assert.equal(data.items[0].images.length,2);
 await handleApi(req('/import',[record]),{DB});data=await (await handleApi(req(''),{DB})).json();assert.equal(data.items[0].images.length,2);sqlite.close();
});
