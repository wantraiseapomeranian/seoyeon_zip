import {createServer} from 'node:http';
import {readFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const server=createServer((req,res)=>{const file=req.url.slice(1);if(!/^[\w.-]+\.(html|css|js)$/.test(file)){res.writeHead(404).end();return;}try{let body=readFileSync('validation/'+file,'utf8');if(file.endsWith('.html'))body=body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,t=>t.includes('/date-controls.js')?t:'');res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'text/html');res.end(body);}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 const iphone=process.argv.includes('--iphone');
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({userAgent:iphone?'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1':'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36'});mkdirSync('.local/dark-controls',{recursive:true});
 for(const theme of ['light','dark'])for(const file of ['feed.html','x-review.html','instagram.html','review-history.html']){
  await page.emulateMedia({colorScheme:theme});await page.setViewportSize({width:390,height:844});await page.goto(`http://127.0.0.1:${server.address().port}/${file}`);
  await page.addScriptTag({url:'/review-gallery.js'});
  await page.evaluate(()=>{document.querySelector('#month-panel')?.removeAttribute('hidden');const image='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="#758795"/></svg>');for(const input of document.querySelectorAll('input[type=date]')){input.value='2026-09-18';input.dispatchEvent(new Event('input',{bubbles:true}));}const viewer=window.reviewGallery([{src:image},{src:image}],{label:'검증 사진'});if(document.querySelector('#gallery'))viewer.element.classList.add('feed-gallery');(document.querySelector('#gallery,#items')??document.querySelector('main')).append(viewer.element);});
  const date=page.locator('input[type=date]').first();if(await date.count()){
   const colors=await date.evaluate(e=>{const s=getComputedStyle(e);return {scheme:s.colorScheme,color:s.color,bg:s.backgroundColor,fill:s.webkitTextFillColor,value:e.value};});
   assert.equal(await date.evaluate(e=>e.parentElement.querySelector('.date-value')?.textContent),'2026.09.18');
   await date.fill('');assert.equal(await date.evaluate(e=>e.parentElement.querySelector('.date-value')?.textContent),'날짜 선택');await date.fill('2026-09-18');
   assert.equal(await date.evaluate(e=>{const r=e.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===e;}),true,'native input receives taps');
   await date.evaluate(e=>{const button=document.createElement('button');button.id='test-date-reset';button.onclick=()=>{e.value='';};document.body.append(button);});await page.locator('#test-date-reset').click();assert.equal(await date.evaluate(e=>e.parentElement.querySelector('.date-value').textContent),'날짜 선택');await page.locator('#test-date-reset').evaluate(e=>e.remove());await date.fill('2026-09-18');
   assert.equal(colors.value,'2026-09-18');assert.equal(colors.scheme,'light',`${file}: date stays light under ${theme} preference`);assert.equal(colors.bg,'rgb(241, 245, 247)');assert.equal(colors.color,'rgb(32, 37, 43)');assert.equal(colors.fill,colors.color);
   const visible=await date.evaluate(e=>{const s=getComputedStyle(e.parentElement.querySelector('.date-value'));return {bg:s.backgroundColor,color:s.color};});assert.deepEqual(visible,{bg:'rgb(241, 245, 247)',color:'rgb(32, 37, 43)'});
  }
  const next=page.getByRole('button',{name:'검증 사진 다음',exact:true});await next.click();assert.equal(await page.locator('.photo-count').last().textContent(),'2 / 2');await page.getByRole('button',{name:'검증 사진 이전',exact:true}).press('ArrowLeft');assert.equal(await page.locator('.photo-count').last().textContent(),'1 / 2');
  assert.equal(await next.locator('svg[aria-hidden=true]').count(),1);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:`.local/dark-controls/${iphone?'iphone':'samsung'}-${file}-${theme}.png`,fullPage:true});
 }
 console.log(`PASS: ${iphone?'iPhone':'Samsung'}-UA fallback empty/selected/reset values, native tap target, light/dark scheme, arrows/navigation, 390px overflow on four pages. Chrome emulation only; real mobile engine is unverified.`);
}finally{await browser?.close();server.close();}
