import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { testDatabase } from '../tests/helpers/d1.mjs';
import { handleApi } from '../src/worker.mjs';
const {sqlite,DB}=testDatabase();
sqlite.exec(readFileSync('migrations/0009_instagram_review.sql','utf8'));
// Local-only harness: exercises the real router/SQL; production Access is tested separately.
const server=createServer(async(req,res)=>{
  if(req.headers.host!=='127.0.0.1:4178'){res.writeHead(403).end();return;}
  const path=new URL(req.url,'http://127.0.0.1:4178').pathname;
  try{
    if(path.startsWith('/api/')){const chunks=[];for await(const chunk of req)chunks.push(chunk);const response=await handleApi(new Request('http://127.0.0.1:4178'+req.url,{method:req.method,headers:req.headers,...(req.method==='POST'?{body:Buffer.concat(chunks)}:{})}),{DB});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;}
    const file=path==='/admin/instagram'?'instagram.html':path.slice(1);
    if(!['instagram.html','instagram.js','instagram.css','feed.css','review-gallery.js'].includes(file)){res.writeHead(404).end();return;}
    res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html'});res.end(readFileSync('validation/'+file));
  }catch(error){res.writeHead(500).end(error.message);}
});
await new Promise(resolve=>server.listen(4178,'127.0.0.1',resolve));
let browser;
try{
  browser=await chromium.launch({headless:true,channel:'chrome'});
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4178/admin/instagram');await page.waitForSelector('#empty:not([hidden])');
  await page.click('#open-import');await page.fill('#json',JSON.stringify([{shortCode:'Example_123',ownerUsername:'sample_author',caption:'윤서연 tripleS · 미리보기 검증용 예시\n<script>alert(1)</script>',timestamp:'2026-09-10T00:00:00Z',childPosts:[{displayUrl:'https://scontent.cdninstagram.com/one.jpg'},{displayUrl:'https://scontent.cdninstagram.com/two.jpg'}]}]));await page.click('#import-submit');await page.waitForSelector('.review-card');
  assert.equal(await page.locator('.review-caption script').count(),0);await page.getByRole('button',{name:'게시물 사진 다음',exact:true}).click();assert.equal(await page.locator('.photo-count').textContent(),'2 / 2');await page.getByRole('button',{name:'게시물 사진 확대',exact:true}).click();await page.waitForSelector('.photo-dialog[open]');await page.keyboard.press('Escape');
  for(const width of [1440,390]){await page.setViewportSize({width,height:950});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:`.local/instagram-${width}.png`});}
  await page.getByRole('button',{name:'보관',exact:true}).click();await page.waitForSelector('#empty:not([hidden])');await page.click('[data-status=kept]');await page.waitForSelector('.review-card');
  await page.reload();await page.click('[data-status=kept]');await page.waitForSelector('.review-card');
  await page.getByRole('button',{name:'보류',exact:true}).click();await page.waitForSelector('#empty:not([hidden])');await page.click('[data-status=held]');await page.waitForSelector('.review-card');
  assert.deepEqual(errors,[]);assert.equal(sqlite.prepare('SELECT status FROM instagram_review').get().status,'held');
  console.log('PASS: import, literal untrusted caption, keep, hold, reload persistence, empty state, desktop/mobile overflow.');
}finally{await browser?.close();server.close();sqlite.close();}
