import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {testDatabase} from '../tests/helpers/d1.mjs';
import {handleApi} from '../src/worker.mjs';
const {sqlite,DB}=testDatabase();
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1:4193');
 if(url.pathname.startsWith('/api/')){const r=await handleApi(new Request(url),{DB});res.writeHead(r.status,{'Content-Type':'application/json'});res.end(await r.text());return;}
 const file=url.pathname.slice(1);if(!/^[a-z-]+\.(html|js|css)$/.test(file)){res.writeHead(404).end();return;}
 res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html'});res.end(readFileSync('validation/'+file));
 }catch(e){res.writeHead(500).end(e.message);}});
await new Promise(r=>server.listen(4193,'127.0.0.1',r));let browser;
try{browser=await chromium.launch({headless:true,channel:'chrome'});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const width of [320,390,1280])for(const name of ['feed','x-review','instagram']){
  await page.setViewportSize({width,height:850});await page.goto(`http://127.0.0.1:4193/${name}.html?data=live`);
  const feed=name==='feed',input=page.locator(feed?'#month':'#review-date');
  if(feed)await page.locator('#month-trigger').click();assert.equal(await input.getAttribute('type'),'date');
  const queried=page.waitForResponse(r=>new URL(r.url()).searchParams.get('date')==='2026-09-10');await input.fill('2026-09-10');assert.equal((await queried).status(),200);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.equal(await input.evaluate(el=>el.getBoundingClientRect().right<=innerWidth),true);
  await page.screenshot({path:`.local/day-${name}-${width}.png`});
  if(feed){assert.ok(page.url().includes('date=2026-09-10'));await page.reload();assert.equal(await input.inputValue(),'2026-09-10');await page.locator('#month-trigger').click();await page.locator('#clear-month').click();}
  else{await page.locator('#review-more').click();await page.locator('#review-reset').click();}
  assert.equal(await input.inputValue(),'');
 }
 assert.deepEqual(errors,[]);console.log('PASS: day selection, query, clear, feed URL restore, 3 screens x 3 widths, no page errors');
}finally{await browser?.close();await new Promise(r=>server.close(r));sqlite.close();}
