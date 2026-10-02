import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {publicPost} from '../src/public-data.mjs';
import {testDatabase} from '../tests/helpers/d1.mjs';

const flags=new Map();
for(let i=2;i<process.argv.length;i++){
 const flag=process.argv[i];
 if(!['--database','--module','--output','--label','--browser','--fixture','--compare-module','--remote-cost','--scenario'].includes(flag))throw Error('Unknown option: '+flag);
 flags.set(flag,['--browser','--fixture','--remote-cost'].includes(flag)?true:process.argv[++i]);
}
if(!flags.has('--database')&&!flags.has('--fixture'))throw Error('Use --database <local snapshot.sqlite> or --fixture. Remote D1 SELECTs run only with --remote-cost.');
if(flags.has('--remote-cost')&&(!flags.has('--database')||!flags.has('--scenario')))throw Error('--remote-cost requires a verified local --database and one --scenario; executes read-only SELECTs on configured D1.');
const {readFeed}=await import(pathToFileURL(resolve(flags.get('--module')||'src/feed.mjs')));
let sqlite,DB;
if(flags.has('--database')){
 sqlite=new DatabaseSync(resolve(flags.get('--database')),{readOnly:true});
 DB={prepare(sql){return {sql,args:[],bind(...args){this.args=args;return this;},async all(){return {results:sqlite.prepare(sql).all(...this.args)};}};},async batch(statements){return Promise.all(statements.map(s=>s.all()));}};
}else{
 ({sqlite,DB}=testDatabase());
 sqlite.exec('BEGIN');
 for(let i=1;i<=600;i++){
  const id='x:'+i,p={id,authorHandle:'writer'+i%30,canonicalUrl:'https://x.com/fixture/status/'+i,publishedAt:'2026-09-'+String(1+i%25).padStart(2,'0')+'T00:00:00Z',contentKind:i%2?'fansite':'cosmo',media:[{kind:'image',previewUrl:'https://pbs.twimg.com/media/fixture'+i+'.jpg',width:600,height:800}]};
  sqlite.prepare('INSERT INTO posts VALUES(?,?)').run(id,JSON.stringify(p));
  sqlite.prepare('INSERT INTO x_fingerprints(url,hash) VALUES(?,?)').run(p.media[0].previewUrl,'hash'+i);
 }
 for(let i=1;i<=80;i++)sqlite.prepare("INSERT INTO instagram_review(code,data,status,imported_at) VALUES(?,?,'kept','2026-09-22T00:00:00Z')").run('insta'+i,JSON.stringify({author:'photo'+i%10,publishedAt:'2026-09-22T00:00:00Z',contentKind:'fansite',media:[{kind:'image'}],images:['https://s.cdninstagram.com/fixture'+i+'.jpg'],url:'https://www.instagram.com/p/insta'+i+'/'}));
 for(let i=1;i<=60;i++)sqlite.prepare("INSERT INTO youtube_videos(video_id,metadata_json,metadata_fetched_at,decision,format,category) VALUES(?,?,?,'kept','regular','fancam')").run(String(i).padStart(11,'0'),JSON.stringify({title:'fixture',channelTitle:'fixture',publishedAt:'2026-09-22T00:00:00Z',thumbnailUrl:'https://i.ytimg.com/vi/fixture/default.jpg'}),Math.floor(Date.now()/1000));
 sqlite.exec('COMMIT');
}
const sourceHash=path=>createHash('sha256').update(readFileSync(resolve(path))).digest('hex');
const moduleDigests={current:sourceHash(flags.get('--module')||'src/feed.mjs'),...(flags.has('--compare-module')?{baseline:sourceHash(flags.get('--compare-module'))}:{})};
const commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
let records=[],queries=[];
const stage=sql=>sql.includes('AS section')?'countPageAuthors':sql.includes('MAX(last_success_at)')?'collectionState':sql.includes('preview_url FROM')?'imageAliases':sql.includes('WITH photos')?'duplicateSources':'other';
const measured={prepare(sql){const statement=DB.prepare(sql);const wrap={sql,args:[],bind(...args){this.args=args;statement.bind(...args);return this;},statement,async all(){const start=performance.now();const result=await statement.all();queries.push({sql,args:wrap.args});records.push({stage:stage(sql),sqlMs:performance.now()-start,rowsRead:null});return result;}};return wrap;},async batch(statements){const result=[];for(const s of statements)result.push(await s.all());return result;}};
const median=values=>{const v=values.filter(Number.isFinite).sort((a,b)=>a-b);return v.length?v[Math.floor(v.length/2)]:null;};
const range=values=>{const v=values.filter(Number.isFinite);return v.length?[Math.min(...v),Math.max(...v)]:null;};
const publicResponse=response=>({...response,posts:response.posts.map(publicPost)});
const identity=response=>createHash('sha256').update(JSON.stringify(response)).digest('hex');
const seed=await readFeed(DB,new URLSearchParams({media:'image'}));
const date=seed.posts[0]?.publishedAt?.slice(0,10)||'2026-09-22';
const author=(seed.authors||[]).find(a=>a.platform==='x')?.value||'x:fixture';
const scenarios=[['photo',{}],['platformX',{platform:'x'}],['platformInstagram',{platform:'instagram'}],['author',{author}],['dateKind',{date,kind:'fansite'}],['youtube',{media:'youtube',youtubeFormat:'regular',youtubeCategory:'fancam'}],['page2',{cursor:seed.nextCursor}],['page2WithoutAuthors',{cursor:seed.nextCursor,authors:'omit'}]];
const variants=[['current',readFeed]];
if(flags.has('--compare-module'))variants.unshift(['baseline',(await import(pathToFileURL(resolve(flags.get('--compare-module'))))).readFeed]);
const samples=[],summaries=[];
function remoteSamples(querySet,scenario,variant){
 // Alias keys can contain long signed URLs; keep them out of CLI arguments.
 const selected=querySet.filter(q=>stage(q.sql)!=='imageAliases'),partial=selected.length!==querySet.length;
 const literal=value=>value===null?'NULL':typeof value==='number'?String(value):"'"+String(value).replaceAll("'","''")+"'";
 const rendered=selected.map(q=>{let i=0;const sql=q.sql.replaceAll('?',()=>literal(q.args[i++]));if(i!==q.args.length||!/^\s*(?:SELECT|WITH)\b/i.test(sql))throw Error('Remote query must be a parameter-matched SELECT');return sql;});
 const command=Array.from({length:5},()=>rendered.join(';')).join(';');
 if(command.length>24000)throw Error('Remote SELECT command exceeds bounded argument size');
 let results;
 try{results=JSON.parse(execFileSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute','seoyeon-zip-validation','--remote','--json','--command',command],{encoding:'utf8',maxBuffer:16*1024*1024,timeout:45000,stdio:['ignore','pipe','pipe']}));}
 catch(error){throw Error('Remote SELECT failed; raw rows suppressed: '+(error.code??error.status));}
 if(results.length!==selected.length*5||results.some(r=>r.success===false))throw Error('Unexpected remote SELECT results');
 return Array.from({length:5},(_,i)=>{
  const group=results.slice(i*selected.length,(i+1)*selected.length),stages=group.map((r,j)=>({stage:stage(selected[j].sql),sqlMs:r.meta?.timings?.sql_duration_ms??r.meta?.duration??null,rowsRead:r.meta?.rows_read??null}));
  const sum=key=>stages.every(s=>Number.isFinite(s[key]))?stages.reduce((n,s)=>n+s[key],0):null;
  return {commit,label:(flags.get('--label')||'measurement')+':'+variant,scenario:scenario+':remoteSQL',sampleCount:5,sample:i+1,cacheMode:'D1 SELECT replay; cache behavior uncontrolled',viewport:null,apiMs:null,sqlMs:partial?null:sum('sqlMs'),rowsRead:partial?null:sum('rowsRead'),observedSqlMs:sum('sqlMs'),observedRowsRead:sum('rowsRead'),responseBytes:null,lcpMs:null,cls:null,failedRequests:null,stages,limitation:partial?'Image aliases omitted: reported observed costs are a partial sum':'Worker HTTP latency and response size unmeasured; production may change during replay'};
 });
}
try{
 if(flags.has('--scenario')&&!scenarios.some(([name])=>name===flags.get('--scenario')))throw Error('Unknown scenario');
 for(const [scenario,extra]of scenarios){
  if(scenario==='page2WithoutAuthors'&&flags.get('--scenario')!==scenario)continue;
  if(flags.has('--scenario')&&scenario!==flags.get('--scenario'))continue;
  if(extra.cursor===null){summaries.push({scenario,skipped:'No second page in snapshot'});continue;}
  const params=new URLSearchParams({media:'image',...extra});const groups=new Map(variants.map(([name])=>[name,[]])),querySets=new Map();
  for(let index=0;index<5;index++)for(const [variant,reader]of index%2?[...variants].reverse():variants){
   records=[];queries=[];const start=performance.now(),response=await reader(measured,params),body=JSON.stringify(publicResponse(response)),apiMs=performance.now()-start;
   const sample={commit,label:(flags.get('--label')||'measurement')+':'+variant,scenario,sampleCount:5,sample:index+1,cacheMode:index?'same SQLite connection; subsequent request':'same SQLite connection; first scenario request',viewport:null,apiMs,sqlMs:records.reduce((n,r)=>n+r.sqlMs,0),rowsRead:null,responseBytes:Buffer.byteLength(body),lcpMs:null,cls:null,failedRequests:null,stages:records,responseHash:identity(response),publicResponseHash:createHash('sha256').update(body).digest('hex')};
   groups.get(variant).push(sample);querySets.set(variant,queries);samples.push(sample);
  }
  for(const [variant,current]of groups){
  const summary={commit,label:(flags.get('--label')||'measurement')+':'+variant,scenario,sampleCount:5,cacheMode:'same SQLite connection; no persistent response cache',viewport:null,apiMs:median(current.map(x=>x.apiMs)),apiMsRange:range(current.map(x=>x.apiMs)),sqlMs:median(current.map(x=>x.sqlMs)),sqlMsRange:range(current.map(x=>x.sqlMs)),rowsRead:null,responseBytes:current[0].responseBytes,lcpMs:null,cls:null,failedRequests:null,stages:Object.fromEntries(['countPageAuthors','collectionState','imageAliases','duplicateSources'].map(name=>[name,median(current.map(s=>s.stages.filter(r=>r.stage===name).reduce((n,r)=>n+r.sqlMs,0)))])),responseHash:current[0].responseHash,publicResponseHash:current[0].publicResponseHash};
  summaries.push(summary);console.log(JSON.stringify(summary));
  }
  if(flags.has('--remote-cost'))for(const [variant,querySet]of querySets){const remote=remoteSamples(querySet,scenario,variant);samples.push(...remote);console.log(JSON.stringify({scenario:scenario+':remoteSQL',variant,sampleCount:5,rowsRead:remote.map(r=>r.rowsRead),observedRowsRead:remote.map(r=>r.observedRowsRead),sqlMs:remote.map(r=>r.sqlMs),observedSqlMs:remote.map(r=>r.observedSqlMs)}));}
 }
 if(flags.has('--browser')){
  const {createServer}=await import('node:http');const {readFileSync}=await import('node:fs');const {chromium}=await import('playwright');
  const server=createServer(async(req,res)=>{
   try{
    const url=new URL(req.url,'http://fixture');
    if(url.pathname==='/api/feed'){res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(publicResponse(await readFeed(DB,url.searchParams))));return;}
    if(url.pathname.startsWith('/api/')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(url.pathname==='/api/session'?{role:'visitor'}:{sources:[]}));return;}
    const file=url.pathname==='/'?'feed.html':url.pathname.slice(1);if(!/^[\w-]+\.(html|css|js|webmanifest|png|ico)$/.test(file)){res.writeHead(404).end();return;}
    res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(readFileSync('validation/'+file));
   }catch{res.writeHead(500).end();}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true});
  try{for(const viewport of [{width:390,height:844},{width:1280,height:900}])for(let index=0;index<5;index++){
   const context=await browser.newContext({viewport,serviceWorkers:'block'}),page=await context.newPage();let failedRequests=0;
   page.on('requestfailed',()=>failedRequests++);page.on('response',r=>{if(r.status()>=400)failedRequests++;});
   // Deterministic 120ms image response, browser default network/CPU. Never contact source CDNs.
   await page.route('**/*',async route=>{
    if(new URL(route.request().url()).hostname==='127.0.0.1')return route.continue();
    if(route.request().resourceType()==='image'){await new Promise(r=>setTimeout(r,120));return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="#cce0e9"/></svg>'});}
    return route.abort();
   });
   await page.addInitScript(()=>{window.feedMetrics={lcpMs:null,cls:0};new PerformanceObserver(list=>{for(const e of list.getEntries()){window.feedMetrics.lcpMs=e.startTime;window.feedMetrics.lcpElement=e.element?.tagName??null;}}).observe({type:'largest-contentful-paint',buffered:true});new PerformanceObserver(list=>{for(const e of list.getEntries())if(!e.hadRecentInput)window.feedMetrics.cls+=e.value;}).observe({type:'layout-shift',buffered:true});});
   await page.goto('http://127.0.0.1:'+server.address().port+'/?data=live');await page.waitForFunction(()=>document.querySelector('#gallery').getAttribute('aria-busy')==='false');await page.waitForTimeout(600);
   await page.waitForFunction(()=>{const img=document.querySelector('.card img[src]');return !img||img.complete;});
   const metrics=await page.evaluate(()=>{const api=performance.getEntriesByType('resource').find(e=>e.name.includes('/api/feed'));const images=performance.getEntriesByType('resource').filter(e=>e.initiatorType==='img');return {...window.feedMetrics,apiMs:api?api.responseEnd-api.startTime:null,imageWaitMs:images.length?Math.max(...images.map(e=>e.duration)):null};});
   samples.push({commit,label:flags.get('--label')||'current',scenario:'browserPhoto',sampleCount:5,sample:index+1,cacheMode:'fresh browser context; HTTP no-store; same SQLite connection',viewport,...metrics,sqlMs:null,rowsRead:null,responseBytes:null,failedRequests});await context.close();
  }}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
 }
 const output=resolve(flags.get('--output')||'.local/feed-performance/'+(flags.get('--label')||'current')+'.json');mkdirSync(dirname(output),{recursive:true});
 writeFileSync(output,JSON.stringify({environment:{moduleDigests,measuredAt:new Date().toISOString(),node:process.version,backend:flags.has('--fixture')?'synthetic fixture with production views':'read-only restored SQLite snapshot',rowsReadUnavailable:'Node SQLite does not expose D1 rows_read; not substituted with adapter zero',browserLimit:'Fixture images; external CDN and deployed Worker latency unmeasured',sqlBreakdownLimit:'Count, page and authors run in one production statement; reported together'},summaries,samples},null,2)+'\n');console.log('Saved measurement report under .local/feed-performance');
}finally{sqlite.close();}
