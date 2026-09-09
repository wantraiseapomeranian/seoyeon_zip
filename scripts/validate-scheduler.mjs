import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { Miniflare,convertV4MiniflareOptions } from 'miniflare';

if(process.argv[2]!=='--local') throw Error('Use --local. This harness never connects to a remote DB.');
const bundle=await build({entryPoints:['src/worker.mjs'],bundle:true,format:'esm',platform:'neutral',conditions:['workerd','worker','browser'],external:['node:*'],write:false});
let requests=0,status=200,stopDuringFetch=false,DB;
const mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:'scheduler-validation',modules:true,script:bundle.outputFiles[0].text,
  compatibilityDate:'2026-09-09',compatibilityFlags:['nodejs_compat'],
  d1Databases:['DB'],bindings:{COLLECTION_ENABLED:'true'},
  outboundService:async request=>{
    assert.equal(new URL(request.url).hostname,'api.fxtwitter.com');
    assert.match(request.headers.get('User-Agent'),/^SeoyeonZip\//);requests++;
    if(stopDuringFetch) await DB.prepare('UPDATE collection_control SET enabled=0,revision=revision+1').run();
    if(status!==200) return new Response(null,{status,headers:{'Retry-After':'120'}});
    const results=Array.from({length:21},(_,i)=>({type:'status',id:String(i+1),url:`https://x.com/Seowoo_0501/status/${i+1}`,author:{screen_name:'Seowoo_0501'},reposted_by:null,text:'',created_at:'2000-01-01T00:00:00Z',media:{all:[{type:'photo',url:'https://pbs.twimg.com/media/example.jpg'}]}}));
    return Response.json({code:200,results,cursor:{bottom:'next-'+requests}});
  }}]}));
try {
  DB=await mf.getD1Database('DB');
  for(const name of ['0001_validation.sql','0002_collection_state.sql','0003_collection_lanes.sql','0004_secondary_sources.sql','0005_official_review.sql','0006_pumpkin_source.sql','0007_source_outcome.sql','0008_unrestricted_history.sql']) {
    const sql=readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8');
    for(const statement of sql.replace(/^\s*--.*$/gm,'').split(';').filter(s=>s.trim()))
      await DB.prepare(statement).run();
  }
  const worker=await mf.getWorker();
  const dispatch=async()=>assert.equal((await worker.scheduled()).outcome,'ok');
  const state=()=>DB.prepare("SELECT * FROM collection_state WHERE source='Seowoo_0501'").first();
  await dispatch();assert.equal(requests,0);
  await DB.prepare('UPDATE collection_control SET enabled=1,revision=revision+1').run();
  await DB.prepare("UPDATE collection_state SET enabled=1 WHERE source='Seowoo_0501'").run();
  await dispatch();assert.equal(requests,1);
  assert.equal((await DB.prepare('SELECT COUNT(*) n FROM posts').first()).n,21);
  assert.equal((await state()).next_cursor,'next-1');
  await DB.prepare('UPDATE collection_state SET next_due_at=0').run();
  await dispatch();assert.equal((await DB.prepare('SELECT COUNT(*) n FROM posts').first()).n,21);
  const committed=(await state()).next_cursor;
  await DB.exec("CREATE TRIGGER fail_media BEFORE INSERT ON media BEGIN SELECT RAISE(ABORT,'media failure'); END;");
  await DB.prepare('UPDATE collection_state SET next_due_at=0').run();
  // Storage faults fail the event; a failed batch must preserve the committed page.
  let failed=false;try{failed=(await worker.scheduled()).outcome!=='ok';}catch{failed=true;}
  assert.equal(failed,true);assert.equal((await state()).next_cursor,committed);
  assert.equal((await DB.prepare('SELECT COUNT(*) n FROM media').first()).n,21);
  await DB.exec('DROP TRIGGER fail_media');
  await DB.prepare('UPDATE collection_state SET next_due_at=0,lease_until=0').run();
  stopDuringFetch=true;await dispatch();assert.equal((await state()).next_cursor,committed);
  const count=requests;await dispatch();assert.equal(requests,count);stopDuringFetch=false;
  await DB.prepare('UPDATE collection_control SET enabled=1,revision=revision+1').run();
  await DB.prepare('UPDATE collection_state SET next_due_at=0,lease_until=0').run();
  status=429;await dispatch();assert.equal((await state()).catchup_status,'retry');
  assert.equal((await state()).next_cursor,committed);
  await DB.prepare('UPDATE collection_state SET next_due_at=0').run();
  status=401;await dispatch();assert.equal((await state()).catchup_status,'needs_attention');
  const finalCount=requests;await dispatch();assert.equal(requests,finalCount);
  assert.equal((await worker.fetch('https://example.test/api/sources')).status,503);
  console.log(JSON.stringify({mode:'local-workerd',checks:['disabled','21-posts','replay','batch-rollback','stop-during-fetch','429','401','http-fail-closed'],requests,posts:21}));
} finally { await mf.dispose(); }
