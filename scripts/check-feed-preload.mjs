import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import worker from '../src/worker.mjs';
let requests=[];
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'https://fixture.test');
 if(url.pathname.startsWith('/api/')){
  res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','private, no-store');
  if(url.pathname==='/api/feed'){requests.push(url.search);return res.end(JSON.stringify({posts:[],total:0,nextCursor:null,collectedAt:null}));}
  return res.end(JSON.stringify(url.pathname==='/api/session'?{role:'visitor'}:{sources:[]}));
 }
 const response=await worker.fetch(new Request(url),{PUBLIC_FEED_ENABLED:'true',ASSETS:{fetch:async request=>{
  const file=new URL(request.url).pathname.slice(1);if(!/^[\w-]+\.(html|js|css|ico|png|webmanifest)$/.test(file))return new Response(null,{status:404});
  try{
   let content=readFileSync('validation/'+file);
   if(file==='feed.js'){
    await new Promise(r=>setTimeout(r,600));
    // Exercise the production live-data branch on a loopback-only fixture server.
    content='window.feedScriptTime=performance.now();\n'+content.toString().replace(/^const live=.*;$/m,'const live=true;');
   }
   return new Response(content,{headers:{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'image/png'}});
  }catch{return new Response(null,{status:404});}
 }}});
 res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true});
try{for(const query of ['', '?source=instagram','?media=video','?sort=oldest','?date=2026-09-22']){
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));requests=[];
 const response=await page.goto(`http://127.0.0.1:${server.address().port}/${query}`);await page.waitForFunction(()=>document.querySelector('#gallery').getAttribute('aria-busy')==='false');
 assert.equal(requests.length,1,`one feed request for ${query}`);
 const timing=await page.evaluate(()=>({script:window.feedScriptTime,api:performance.getEntriesByType('resource').find(r=>r.name.includes('/api/feed'))?.startTime}));
 if(!query){assert.match(response.headers().link,/as=fetch/);assert.ok(timing.api<timing.script-300,JSON.stringify(timing));}
 else{assert.equal(response.headers().link,undefined);const expected=new URLSearchParams(query);for(const [k,v]of expected)assert.equal(new URLSearchParams(requests[0]).get(k),v);}
 await page.locator('#refresh').click();await page.waitForFunction(()=>document.querySelector('#gallery').getAttribute('aria-busy')==='false');assert.equal(requests.length,2,'refresh must fetch fresh data');
 assert.deepEqual(errors,[]);console.log('PASS preload',query||'default',JSON.stringify(timing));await page.close();
}}finally{await browser.close();server.closeAllConnections();server.close();}
