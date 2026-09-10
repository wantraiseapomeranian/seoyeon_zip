import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { testDatabase } from './helpers/d1.mjs';
import worker, { handleApi } from '../src/worker.mjs';

const base='https://example.test';
const record={shortCode:'Example_123',caption:'윤서연 tripleS',ownerUsername:'example',timestamp:'2026-09-10T00:00:00Z',displayUrl:'https://scontent.cdninstagram.com/photo.jpg'};
function req(path,body,headers={}) {return new Request(base+'/api/admin/instagram'+path,{method:body?'POST':'GET',headers:{origin:base,'content-type':'application/json','x-review-action':'review',...headers},...(body?{body:JSON.stringify(body)}:{})});}
test('review endpoints reject unauthenticated callers before touching data',async()=>{
  const env={TEAM_DOMAIN:'https://test.cloudflareaccess.com',POLICY_AUD:'aud',OWNER_EMAIL:'owner@example.test'};
  for(const path of ['/admin/instagram','/api/admin/instagram','/api/admin/instagram/import']) {
    assert.equal((await worker.fetch(new Request(base+path),env)).status,401);
  }
});
test('import and decisions preserve manual review across duplicates; stale writes conflict',async()=>{
  const {sqlite,DB}=testDatabase();
  // New migration is optional here so the first run fails on missing behavior, not missing file.
  try {sqlite.exec(readFileSync(new URL('../migrations/0009_instagram_review.sql',import.meta.url),'utf8'));} catch(e){if(e.code!=='ENOENT')throw e;}
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
