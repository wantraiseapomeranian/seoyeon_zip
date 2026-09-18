import {createServer} from 'node:http';
import {readFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const server=createServer((req,res)=>{const file=req.url.slice(1);if(!/^[\w.-]+\.(html|css|js)$/.test(file)){res.writeHead(404).end();return;}try{let body=readFileSync('validation/'+file,'utf8');if(file.endsWith('.html'))body=body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,t=>t.includes('/date-controls.js')?t:'');res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'text/html');res.end(body);}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({userAgent:'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36'});mkdirSync('.local/dark-controls',{recursive:true});
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
   assert.equal(colors.value,'2026-09-18');assert.equal(colors.scheme,theme,`${file}: native date uses ${theme} scheme`);assert.notEqual(colors.bg,'rgba(0, 0, 0, 0)');assert.equal(colors.fill,colors.color);
  }
  const next=page.getByRole('button',{name:'검증 사진 다음',exact:true});await next.click();assert.equal(await page.locator('.photo-count').last().textContent(),'2 / 2');await page.getByRole('button',{name:'검증 사진 이전',exact:true}).press('ArrowLeft');assert.equal(await page.locator('.photo-count').last().textContent(),'1 / 2');
  assert.equal(await next.locator('svg[aria-hidden=true]').count(),1);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:`.local/dark-controls/${file}-${theme}.png`,fullPage:true});
 }
 console.log('PASS: Samsung-UA fallback empty/selected/reset values, native tap target, light/dark scheme, arrows/navigation, 390px overflow on four pages. Real Samsung engine is unverified.');
}finally{await browser?.close();server.close();}
