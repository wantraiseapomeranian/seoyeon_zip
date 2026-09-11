import test from 'node:test';
import assert from 'node:assert/strict';
import {publicSource,publicPost} from '../src/public-data.mjs';

test('public source status has only allowed fields and respects stop/error priority',()=>{
 const base={source:'WEV86_',enabled:1,collection_enabled:true,last_success_at:0,revision:91,cursor:'private',last_error_code:null};
 assert.deepEqual(publicSource({...base,enabled:0,last_error_code:'storage_error'}),{source:'WEV86_',state:'paused',lastSuccessAt:'1970-01-01T00:00:00.000Z'});
 for(const collection_enabled of [false,0])assert.equal(publicSource({...base,collection_enabled}).state,'paused');
 assert.equal(publicSource({...base,last_error_code:'storage_error'}).state,'attention');
 assert.equal(publicSource({...base,catchup_status:'needs_attention'}).state,'attention');
 for(const last_error_code of ['history_window_unverified','unverified_exhaustion','repeated_cursor'])assert.equal(publicSource({...base,last_error_code}).state,'ok');
 assert.deepEqual(publicSource({...base,last_success_at:null}),{source:'WEV86_',state:'waiting',lastSuccessAt:null});
 assert.equal(publicSource(base).state,'ok');
});

test('public post projection strips internal data at every object level',()=>{
 const raw={id:'x:1',publishedAt:'2026-09-11',canonicalUrl:'https://x.com/a/status/1',authorHandle:'a',observedViaSource:'b',platform:'x',contentKind:'fansite',caption:'서연',manual:false,dateEstimated:false,moderationReason:'private',revision:9,media:[{kind:'image',previewUrl:'https://pbs.twimg.com/media/a.jpg',width:20,height:30,secret:'private'}],duplicateSources:[{url:'https://x.com/b/status/2',author:'b',decision:'private'}]};
 const result=publicPost(raw);
 assert.deepEqual(result,{id:raw.id,publishedAt:raw.publishedAt,canonicalUrl:raw.canonicalUrl,authorHandle:'a',observedViaSource:'b',platform:'x',contentKind:'fansite',caption:'서연',manual:false,dateEstimated:false,media:[{kind:'image',previewUrl:raw.media[0].previewUrl,width:20,height:30}],duplicateSources:[{url:raw.duplicateSources[0].url,author:'b'}]});
 assert.ok(!JSON.stringify(result).includes('private'));
 assert.equal(raw.media[0].secret,'private');
});

test('anonymous worker reads only public projected data and rejects every management mutation',async()=>{
 const {default:worker}=await import('../src/worker.mjs');
 const {testDatabase}=await import('./helpers/d1.mjs');
 const {sqlite,DB,enable}=testDatabase();enable();
 try{
  const post={id:'x:991',publishedAt:'2026-09-01',canonicalUrl:'https://x.com/a/status/991',authorHandle:'a',observedViaSource:'a',moderationReason:'private',media:[{kind:'image',previewUrl:'https://pbs.twimg.com/media/a.jpg',privateRaw:'private'}]};
  sqlite.prepare('INSERT INTO posts VALUES(?,?)').run(post.id,JSON.stringify(post));
  sqlite.exec("INSERT INTO x_quality(post_id,decision) VALUES('x:991','visible')");
  const env={DB,COLLECTION_ENABLED:'true',PUBLIC_FEED_ENABLED:'true',TEAM_DOMAIN:'https://test.cloudflareaccess.com',POLICY_AUD:'aud',OWNER_EMAIL:'owner@example.test'};
  const feed=await worker.fetch(new Request('https://test.local/api/feed'),env);assert.equal(feed.status,200);
  const result=await feed.json();assert.equal(result.posts.length,1);assert.ok(!JSON.stringify(result).includes('private'));
  const status=await worker.fetch(new Request('https://test.local/api/collection-status'),env);assert.equal(status.status,200);
  const data=await status.json();assert.ok(data.sources.length>0);
  for(const source of data.sources)assert.deepEqual(Object.keys(source).sort(),['lastSuccessAt','source','state']);
  const before=sqlite.prepare('SELECT * FROM collection_state ORDER BY source').all();
  for(const [path,method] of [['/api/sources/Seowoo_0501','PATCH'],['/api/sources/Seowoo_0501/retry','POST'],['/api/manual-posts','POST'],['/api/admin/x','POST'],['/api/admin/instagram','POST']]){
   const response=await worker.fetch(new Request('https://test.local'+path,{method,headers:{origin:'https://test.local','content-type':'application/json','x-management-action':'manage','x-validation-action':'collect','x-review-action':'review'},body:'{}'}),env);
   assert.equal(response.status,401,path);
  }
  assert.deepEqual(sqlite.prepare('SELECT * FROM collection_state ORDER BY source').all(),before);
 }finally{sqlite.close();}
});
