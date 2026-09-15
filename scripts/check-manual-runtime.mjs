import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
if(process.argv[2]!=='--local')throw Error('Use --local; no remote resources are used.');
const bundle=await build({stdin:{contents:"import {handleApi} from './src/worker.mjs';import {processManual} from './src/manual-posts.mjs';export default {fetch:(r,e,c)=>handleApi(r,e,null,c),scheduled:(_,e,c)=>c.waitUntil(processManual(e))};",resolveDir:process.cwd()},bundle:true,format:'esm',platform:'neutral',conditions:['workerd','worker','browser'],external:['node:*'],write:false});
let starts=0;
const mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:'manual-local',modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-09-09',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],bindings:{MANUAL_MEDIA_ENABLED:'true',APIFY_TOKEN:'local-only'},outboundService:async request=>{
 const url=new URL(request.url);
 if(url.hostname==='api.fxtwitter.com')return Response.json({code:200,tweet:{id:'123',author:{screen_name:'actual'},text:'runtime',created_at:'2026-09-01T00:00:00Z',media:{all:[{type:'photo',url:'https://pbs.twimg.com/media/a.jpg'}]}}});
 assert.equal(url.hostname,'api.apify.com');assert.equal(request.headers.get('authorization'),'Bearer local-only');
 if(request.method==='POST'){starts++;const input=await request.json();assert.deepEqual(input.directUrls,['https://www.instagram.com/reel/Abcdef/']);assert.equal(input.resultsLimit,1);return Response.json({data:{id:'Run123',status:'RUNNING'}});}
 if(url.pathname.endsWith('/items'))return Response.json([{shortCode:'Abcdef',type:'Video',displayUrl:'https://s.cdninstagram.com/video.jpg'}]);
 return Response.json({data:{id:'Run123',status:'SUCCEEDED',defaultDatasetId:'Data123'}});
}}]}));
try{
 const DB=await mf.getD1Database('DB');
 for(const name of readdirSync('migrations').filter(n=>n.endsWith('.sql')).sort()){
  let statement='';for(const part of readFileSync('migrations/'+name,'utf8').replace(/^\s*--.*$/gm,'').split(';')){
   statement+=part+';';if(!statement.replaceAll(';','').trim()){statement='';continue;}
   if(/CREATE TRIGGER/i.test(statement)&&!/END;\s*$/.test(statement))continue;
   await DB.prepare(statement).run();statement='';
  }
 }

 const post=url=>mf.dispatchFetch('https://local.test/api/manual-posts',{method:'POST',headers:{origin:'https://local.test','content-type':'application/json','x-management-action':'manage'},body:JSON.stringify({url})});
 assert.equal((await post('https://x.com/input/status/123')).status,202);
 for(let i=0;i<30;i++){if((await DB.prepare("SELECT state FROM manual_media_jobs WHERE post_id='manual:x:123'").first())?.state==='ready')break;await new Promise(r=>setTimeout(r,100));}
 assert.equal((await DB.prepare("SELECT state FROM manual_media_jobs WHERE post_id='manual:x:123'").first()).state,'ready');
 assert.equal((await post('https://instagram.com/reel/Abcdef/')).status,202);
 for(let i=0;i<30;i++){if((await DB.prepare("SELECT state FROM manual_media_jobs WHERE post_id='manual:ig:Abcdef'").first())?.state==='waiting')break;await new Promise(r=>setTimeout(r,100));}
 await DB.prepare('UPDATE manual_media_jobs SET next_due_at=0').run();await (await mf.getWorker()).scheduled({cron:'*/3 * * * *'});
 assert.equal((await DB.prepare("SELECT state FROM manual_media_jobs WHERE post_id='manual:ig:Abcdef'").first()).state,'ready');assert.equal(starts,1);
 const feed=await (await mf.dispatchFetch('https://local.test/api/feed')).json();assert.equal(feed.total,2);assert.ok(feed.posts.every(p=>p.media[0].previewUrl));
 console.log('PASS: workerd/D1 migrations, request waitUntil, persisted Instagram run, scheduled completion, media feed');
}finally{await mf.dispose();}
