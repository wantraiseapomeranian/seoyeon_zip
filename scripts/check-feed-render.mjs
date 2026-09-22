import {createServer} from 'node:http';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const record=process.argv.includes('--record');
const server=createServer((req,res)=>{const file=new URL(req.url,'http://local').pathname.slice(1)||'feed.html';if(!/^[\w-]+\.(html|css|js)$/.test(file)){res.writeHead(404).end();return;}try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(readFileSync('validation/'+file));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true});const results=[];
try{for(const width of [390,1280]){
 const page=await browser.newPage({viewport:{width,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.shifts=[];new PerformanceObserver(l=>{for(const e of l.getEntries())if(!e.hadRecentInput)window.shifts.push({value:e.value,t:e.startTime});}).observe({type:'layout-shift',buffered:true});});
 await page.route('**/feed.js',async r=>{await new Promise(r=>setTimeout(r,600));await r.continue();});
 let state='normal';const requests=[];
 await page.route('**/api/**',async r=>{const url=new URL(r.request().url());
  if(url.pathname==='/api/feed'){
   requests.push(url.search);await new Promise(r=>setTimeout(r,250));if(state==='error')return r.fulfill({status:503,json:{error:'fixture'}});
   return r.fulfill({json:{posts:state==='empty'?[]:Array.from({length:12},(_,i)=>({id:'fixture-'+i,platform:'instagram',authorHandle:'fixture',publishedAt:'2026-09-22T00:00:00Z',caption:'검증 사진',canonicalUrl:'https://www.instagram.com/p/fixture/',media:[{kind:'image',previewUrl:`https://images.example.test/${i}.svg`,width:600,height:800}]})),total:state==='empty'?0:12,nextCursor:null,collectedAt:'2026-09-22T00:00:00Z'}});
  }
  await r.fulfill({json:url.pathname==='/api/session'?{role:'visitor'}:{sources:[{source:'long_source',state:'ok'}]}});
 });
 await page.route('https://images.example.test/**',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="#ccdfe5"/></svg>'}));
 await page.goto(`http://127.0.0.1:${server.address().port}/?data=live`,{waitUntil:'commit'});
 await page.waitForTimeout(180);
 const boxes=()=>page.evaluate(()=>Object.fromEntries(['header','main','.wordmark','.actions','#gallery','footer'].map(s=>{const r=document.querySelector(s).getBoundingClientRect();return [s,{x:r.x,y:r.y,w:r.width,h:r.height}];})));
 const initial=await boxes();await page.locator('.card').first().waitFor();await page.waitForTimeout(300);const final=await boxes();
 const metrics=await page.evaluate(()=>({cls:window.shifts.reduce((n,e)=>n+e.value,0),images:[...document.querySelectorAll('.card img')].map(i=>({loading:i.loading,priority:i.fetchPriority,src:i.getAttribute('src')})),role:document.querySelector('#gallery').getAttribute('role')}));
 results.push({width,initial,final,...metrics});
 if(!record){assert.ok(metrics.cls<0.1,`CLS ${width}: ${metrics.cls}`);assert.equal(initial.main.y,final.main.y);assert.equal(metrics.role,'region');assert.equal(metrics.images[0].loading,'eager');assert.equal(metrics.images[0].priority,'high');assert.equal(metrics.images.at(-1).loading,'lazy');assert.equal(metrics.images.at(-1).src,null);}
 for(const next of ['empty','error']){state=next;await page.locator('#refresh').click();await page.waitForFunction(()=>document.querySelector('#gallery').getAttribute('aria-busy')==='false');assert.equal(await page.locator('#gallery .card').count(),0);if(!record)assert.equal(await page.locator('#gallery').getAttribute('role'),'region');}
 assert.deepEqual(errors,[]);await page.close();
}
 mkdirSync('.local/ui-fixes',{recursive:true});writeFileSync('.local/ui-fixes/feed-'+(record?'before':'after')+'.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results.map(({width,cls,initial,final})=>({width,cls,initial,final}))));
}finally{await browser.close();server.closeAllConnections();server.close();}
