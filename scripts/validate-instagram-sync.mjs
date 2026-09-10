import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
if(process.argv[2]!=='--local')throw Error('Use --local; this harness never contacts Apify or remote D1.');
const bundle=await build({entryPoints:['src/worker.mjs'],bundle:true,format:'esm',platform:'neutral',conditions:['workerd','worker','browser'],external:['node:*'],write:false});
const rows=Array.from({length:12},(_,i)=>({shortCode:'Local_'+i,type:'Video',productType:'clips',displayUrl:'https://scontent.cdninstagram.com/'+i+'.jpg'}));
let requests=0;
const mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:'instagram-sync-validation',modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-09-09',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],bindings:{APIFY_SYNC_ENABLED:'true',APIFY_TASK_ID:'Task123',APIFY_TOKEN:'local-test-only'},outboundService:async request=>{
 const url=new URL(request.url);assert.equal(url.hostname,'api.apify.com');assert.equal(request.method,'GET');assert.equal(request.headers.get('Authorization'),'Bearer local-test-only');requests++;
 if(url.pathname.includes('actor-tasks'))return Response.json({data:{items:[{id:'Run123',status:'SUCCEEDED',defaultDatasetId:'Data123',finishedAt:'2026-09-10T00:00:00Z'}]}});
 if(!url.pathname.endsWith('/items'))return Response.json({data:{id:'Data123',itemCount:12}});
 const offset=Number(url.searchParams.get('offset'));return Response.json(rows.slice(offset,offset+10));
}}]}));
try{
 const DB=await mf.getD1Database('DB');
 const names=['0001_validation.sql','0002_collection_state.sql','0003_collection_lanes.sql','0004_secondary_sources.sql','0005_official_review.sql','0006_pumpkin_source.sql','0007_source_outcome.sql','0009_instagram_review.sql','0010_x_quality.sql','0011_x_photo_decisions.sql','0012_instagram_feed.sql','0013_management.sql','0014_instagram_media.sql','0015_instagram_sync.sql'];
 for(const name of names)for(const sql of readFileSync('migrations/'+name,'utf8').replace(/^\s*--.*$/gm,'').split(';').filter(s=>s.trim()))await DB.prepare(sql).run();
 const worker=await mf.getWorker();
 for(let i=0;i<2;i++){assert.equal((await worker.scheduled({cron:'2-59/5 * * * *'})).outcome,'ok');await DB.prepare('UPDATE instagram_sync SET next_due_at=0').run();}
 assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM instagram_review').first()).n,12);
 assert.equal((await DB.prepare("SELECT COUNT(*) AS n FROM instagram_review WHERE status='pending'").first()).n,12);
 assert.equal((await DB.prepare('SELECT state FROM instagram_sync_runs').first()).state,'complete');
 assert.equal((await mf.dispatchFetch('http://local.test/api/admin/instagram/sync')).status,503);
 console.log(JSON.stringify({runtime:'workerd',requests,posts:12,checks:['scheduled-routing','bounded-pages','pending-only','atomic-checkpoint','private-status']}));
}finally{await mf.dispose();}
