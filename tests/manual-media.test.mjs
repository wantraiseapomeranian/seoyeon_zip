import test from 'node:test';
import assert from 'node:assert/strict';
import {testDatabase} from './helpers/d1.mjs';
import worker,{handleApi} from '../src/worker.mjs';
const request=body=>new Request('https://test.local/api/manual-posts',{method:'POST',headers:{origin:'https://test.local','content-type':'application/json','x-management-action':'manage'},body:JSON.stringify(body)});
const tweet={id:'123',author:{screen_name:'actual'},text:'photo',created_at:'2026-09-01T00:00:00Z',media:{all:[{type:'photo',url:'https://pbs.twimg.com/media/a.jpg',width:800,height:1000},{type:'video',thumbnail_url:'https://pbs.twimg.com/media/b.jpg'}]}};
async function enqueue(env,url='https://x.com/input/status/123'){
 const r=await handleApi(request({url}),env);assert.equal(r.status,202);return (await r.json()).id;
}
async function process(env,fetcher){const {processManual}=await import('../src/manual-posts.mjs');return processManual(env,{fetcher});}
test('URL registration queues media; X saves actual author, date, and ordered media',async()=>{
 const {DB,sqlite}=testDatabase();try{const env={DB,MANUAL_MEDIA_ENABLED:'true'};await enqueue(env);
 await process(env,async()=>Response.json({code:200,tweet}));
 const p=JSON.parse(sqlite.prepare('SELECT data FROM manual_posts').get().data);
 assert.equal(p.authorHandle,'actual');assert.equal(p.dateEstimated,false);assert.equal(p.media.length,2);assert.equal(p.media[1].kind,'video');
 assert.equal(sqlite.prepare('SELECT state FROM manual_media_jobs').get().state,'ready');
 }finally{sqlite.close();}
});
test('provider failure preserves link and successful media; repeated registration does not restart work',async()=>{
 const {DB,sqlite}=testDatabase();try{const env={DB,MANUAL_MEDIA_ENABLED:'true'};await enqueue(env);await process(env,async()=>Response.json({code:200,tweet}));
 sqlite.exec('UPDATE manual_media_jobs SET updated_at=0');
 await handleApi(request({url:'https://x.com/input/status/123',retry:true}),env);
 await process(env,async()=>new Response('',{status:503}));
 assert.equal(JSON.parse(sqlite.prepare('SELECT data FROM manual_posts').get().data).media.length,2);
 assert.equal(sqlite.prepare('SELECT state FROM manual_media_jobs').get().state,'failed');
 await handleApi(request({url:'https://x.com/input/status/123'}),env);
 assert.equal(sqlite.prepare('SELECT state FROM manual_media_jobs').get().state,'failed');
 }finally{sqlite.close();}
});
test('Instagram run resumes after restart and preserves carousel media types',async()=>{
 const {DB,sqlite}=testDatabase();try{const env={DB,MANUAL_MEDIA_ENABLED:'true',APIFY_TOKEN:'test'};await enqueue(env,'https://instagram.com/reel/Abcdef/');
 await process(env,async()=>Response.json({data:{id:'Run123',status:'RUNNING'}}));
 assert.equal(sqlite.prepare('SELECT run_id FROM manual_media_jobs').get().run_id,'Run123');
 sqlite.exec('UPDATE manual_media_jobs SET next_due_at=0');
 await process(env,async url=>String(url).includes('/items')?Response.json([{shortCode:'Abcdef',timestamp:'2026-09-01T00:00:00Z',ownerUsername:'artist',type:'Sidecar',childPosts:[{type:'Image',displayUrl:'https://s.cdninstagram.com/a.jpg'},{type:'Video',displayUrl:'https://s.cdninstagram.com/b.jpg'}]}]):Response.json({data:{id:'Run123',status:'SUCCEEDED',defaultDatasetId:'Data123'}}));
 const p=JSON.parse(sqlite.prepare('SELECT data FROM manual_posts').get().data);assert.deepEqual(p.media.map(m=>m.kind),['image','video']);assert.equal(p.authorHandle,'artist');
 }finally{sqlite.close();}
});
test('ambiguous Instagram start is not automatically submitted twice',async()=>{
 const {DB,sqlite}=testDatabase();try{const env={DB,MANUAL_MEDIA_ENABLED:'true',APIFY_TOKEN:'test'};await enqueue(env,'https://instagram.com/p/Abcdef/');
 await process(env,async()=>{throw Error('network');});
 assert.equal(sqlite.prepare('SELECT error FROM manual_media_jobs').get().error,'start_uncertain');
 assert.equal((await process(env,async()=>{throw Error('must not call');})).status,'idle');
 }finally{sqlite.close();}
});
test('lease prevents concurrent calls and stale response cannot overwrite a newer job',async()=>{
 const {DB,sqlite}=testDatabase();try{const env={DB,MANUAL_MEDIA_ENABLED:'true'};await enqueue(env);let release,started;
 const waiting=new Promise(r=>{started=r;});const run=process(env,async()=>{started();return new Promise(r=>{release=r;});});await waiting;
 assert.equal((await process(env,async()=>{throw Error('concurrent call');})).status,'idle');
 sqlite.exec("UPDATE manual_media_jobs SET lease_token='new-owner'");release(Response.json({code:200,tweet}));await run;
 assert.equal(JSON.parse(sqlite.prepare('SELECT data FROM manual_posts').get().data).media[0].previewUrl,null);
 }finally{sqlite.close();}
});
test('wrong post identity and unsafe image hosts never reach the feed',async()=>{
 for(const bad of [{...tweet,id:'999'},{...tweet,media:{all:[{type:'photo',url:'https://evil.test/a.jpg'}]}}]){
 const {DB,sqlite}=testDatabase();try{const env={DB,MANUAL_MEDIA_ENABLED:'true'};await enqueue(env);await process(env,async()=>Response.json({code:200,tweet:bad}));
 assert.equal(sqlite.prepare('SELECT state FROM manual_media_jobs').get().state,'failed');assert.equal(JSON.parse(sqlite.prepare('SELECT data FROM manual_posts').get().data).media[0].previewUrl,null);
 }finally{sqlite.close();}}
});
test('expired Instagram start claim cannot submit a paid run',async()=>{
 const {DB,sqlite}=testDatabase();try{const env={DB,MANUAL_MEDIA_ENABLED:'true',APIFY_TOKEN:'test'};await enqueue(env,'https://instagram.com/p/Abcdef/');
 const prepare=DB.prepare.bind(DB);DB.prepare=sql=>{if(sql.includes("SET state='starting'"))sqlite.exec("UPDATE manual_media_jobs SET lease_token='replacement'");return prepare(sql);};
 let submitted=0;await process(env,async()=>{submitted++;return Response.json({data:{id:'Run123'}});});
 assert.equal(submitted,0);assert.equal(sqlite.prepare('SELECT run_id FROM manual_media_jobs').get().run_id,null);
 }finally{sqlite.close();}
});
test('Instagram p/reel aliases never bypass existing exclusion or create duplicates',async()=>{
 const {DB,sqlite}=testDatabase();try{const env={DB,MANUAL_MEDIA_ENABLED:'true'};await enqueue(env,'https://instagram.com/p/Abcdef/');
 sqlite.prepare('INSERT INTO instagram_review(code,data,imported_at,status) VALUES(?,?,?,?)').run('Abcdef',JSON.stringify({code:'Abcdef',url:'https://www.instagram.com/reel/Abcdef/'}),'2026-09-01','excluded');
 const r=await handleApi(request({url:'https://instagram.com/reel/Abcdef/'}),env);assert.equal((await r.json()).existing,true);
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM managed_feed_posts').get().n,0);
 assert.equal((await process(env,async()=>{throw Error('must not query');})).status,'existing');
 }finally{sqlite.close();}
});
test('refreshing completed Instagram media starts a new run instead of reusing expired dataset URLs',async()=>{
 const {DB,sqlite}=testDatabase();try{const env={DB,MANUAL_MEDIA_ENABLED:'true',APIFY_TOKEN:'test'};await enqueue(env,'https://instagram.com/p/Abcdef/');
 sqlite.exec("UPDATE manual_media_jobs SET state='ready',run_id='OldRun',updated_at=0");
 await handleApi(request({url:'https://instagram.com/p/Abcdef/',retry:true}),env);
 assert.equal(sqlite.prepare('SELECT run_id FROM manual_media_jobs').get().run_id,null);
 assert.equal(sqlite.prepare('SELECT state FROM manual_media_jobs').get().state,'pending');
 }finally{sqlite.close();}
});

test('manual job status stays owner-only and disabled processing makes no external requests',async()=>{
 const {DB,sqlite}=testDatabase();try{const env={DB,MANUAL_MEDIA_ENABLED:'true'};await enqueue(env);
 const response=await worker.fetch(new Request('https://test.local/api/manual-posts'),{...env,PUBLIC_FEED_ENABLED:'true',TEAM_DOMAIN:'https://test.cloudflareaccess.com',POLICY_AUD:'aud',OWNER_EMAIL:'owner@example.test'});assert.equal(response.status,401);
 assert.equal((await process({...env,MANUAL_MEDIA_ENABLED:'false'},async()=>{throw Error('must not call');})).status,'disabled');
 assert.equal(sqlite.prepare('SELECT state FROM manual_media_jobs').get().state,'pending');
 const data=await (await handleApi(new Request('https://test.local/api/manual-posts'),env)).json();assert.equal(data.posts[0].state,'pending');assert.equal('lease_token' in data.posts[0],false);assert.equal('run_id' in data.posts[0],false);
 }finally{sqlite.close();}
});
test('manual listing returns five records and replaces pages without overlap',async()=>{
 const {DB,sqlite}=testDatabase();try{const env={DB};for(let i=0;i<12;i++)await handleApi(request({url:'https://x.com/sample/status/'+(1000+i)}),env);
 const get=async offset=>(await (await handleApi(new Request('https://test.local/api/manual-posts?offset='+offset),env)).json());
 const first=await get(0),second=await get(first.nextOffset),last=await get(second.nextOffset);
 assert.equal(first.posts.length,5);assert.equal(second.posts.length,5);assert.equal(last.posts.length,2);assert.equal(last.nextOffset,null);
 assert.equal(new Set([...first.posts,...second.posts,...last.posts].map(p=>p.id)).size,12);
 }finally{sqlite.close();}
});
