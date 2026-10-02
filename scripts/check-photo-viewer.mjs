import {chromium} from 'playwright';
import {readFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true});
mkdirSync('.local/photo-viewer',{recursive:true});
try{for(const [width,height,review] of [[320,740,false],[390,844,false],[844,390,false],[1280,900,false],[390,844,true]]){
 const page=await browser.newPage({viewport:{width,height},hasTouch:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 let fail=false,slow=false;
 await page.route('https://photos.test/**',async r=>{if(slow&&r.request().url().includes('/original2'))return;await r.fulfill(fail&&r.request().url().includes('/original2')?{status:404,body:''}:{contentType:'image/svg+xml',body:`<svg xmlns="http://www.w3.org/2000/svg" width="${r.request().url().endsWith('2')?1600:900}" height="${r.request().url().endsWith('2')?900:1400}"><rect width="100%" height="100%" fill="#8cbcd6"/><circle cx="450" cy="430" r="220" fill="#e5f1f8"/></svg>`});});
 await page.setContent('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><main style="margin-top:650px;margin-bottom:1100px;max-width:400px"></main>');
 await page.addStyleTag({content:readFileSync('validation/feed.css','utf8')});if(review)await page.addStyleTag({content:readFileSync('validation/instagram.css','utf8')});
 await page.addScriptTag({content:readFileSync('validation/review-gallery.js','utf8')});
 await page.evaluate(review=>{window.viewer=reviewGallery([1,2,3].map(i=>({src:'https://photos.test/thumb'+i,originalSrc:'https://photos.test/original'+i,kind:'image',url:'https://x.com/sample/status/1'})),{label:'사진',fitToImage:true});if(!review)viewer.element.classList.add('feed-gallery');document.querySelector('main').append(viewer.element);},review);
 await page.locator('.photo-frame').scrollIntoViewIfNeeded();await page.waitForFunction(()=>document.querySelector('.photo-frame img').naturalWidth>0);await page.locator('.photo-frame').scrollIntoViewIfNeeded();const before=await page.evaluate(()=>scrollY);
 const frame=await page.locator('.photo-frame').boundingBox();await page.mouse.click(frame.x+frame.width/2,frame.y+frame.height/2);await page.locator('.photo-dialog[open]').waitFor();
 const box=await page.locator('.photo-dialog').boundingBox();assert.ok(box.width>=width-2&&box.height>=height-2,'viewer uses the whole viewport');
 const footerArrows=await page.locator('.photo-viewer-arrow').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {left:r.left,right:innerWidth-r.right,bottom:innerHeight-r.bottom};}));assert.ok(footerArrows.every(r=>r.bottom>=32&&r.left>=24&&r.right>=24),'footer controls stay clear of rounded screen corners even with zero safe-area insets');
 const ready=()=>page.waitForFunction(()=>{const im=document.querySelector('.photo-viewer-stage img');return im&&!im.hidden&&im.complete&&im.naturalWidth>0;});await ready();
 assert.equal(await page.locator('.photo-viewer-count').textContent(),'1 / 3');await page.getByRole('button',{name:'다음 사진',exact:true}).click();await ready();assert.equal(await page.locator('.photo-viewer-count').textContent(),'2 / 3');
 await page.screenshot({path:`.local/photo-viewer/${review?'review-':''}${width}.png`});
 assert.equal(await page.locator('.photo-dialog').evaluate(e=>e.scrollHeight>e.clientHeight+1),false,'no internal vertical scroll');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.ok((await page.locator('.photo-viewer button').evaluateAll(es=>es.filter(e=>!e.hidden).map(e=>e.getBoundingClientRect().height))).every(h=>h>=44));
 await page.keyboard.press('ArrowRight');await ready();assert.equal(await page.locator('.photo-viewer-count').textContent(),'3 / 3');assert.equal(await page.getByRole('button',{name:'다음 사진',exact:true}).isDisabled(),true);
 await page.locator('.photo-viewer-stage').dispatchEvent('pointerdown',{pointerId:1,isPrimary:true,clientX:50,clientY:100});await page.locator('.photo-viewer-stage').dispatchEvent('pointerup',{pointerId:1,isPrimary:true,clientX:180,clientY:110});await ready();assert.equal(await page.locator('.photo-viewer-count').textContent(),'2 / 3');
 if(width===390&&!review){
  const cdp=await page.context().newCDPSession(page),area=await page.locator('.photo-viewer-stage').boundingBox(),y=area.y+area.height/2;
  for(const [type,x] of [['touchStart',280],['touchMove',190],['touchMove',90],['touchEnd',90]])await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y}]});
  await ready();assert.equal(await page.locator('.photo-viewer-count').textContent(),'3 / 3','browser touch swipe advances photo');await cdp.detach();
  await page.keyboard.press('ArrowLeft');await ready();
  await page.locator('.photo-viewer-stage').dispatchEvent('pointerdown',{pointerId:2,isPrimary:true,clientX:50,clientY:100});await page.locator('.photo-viewer-stage').dispatchEvent('pointercancel',{pointerId:2});await page.locator('.photo-viewer-stage').dispatchEvent('pointerup',{pointerId:2,isPrimary:true,clientX:180,clientY:100});assert.equal(await page.locator('.photo-viewer-count').textContent(),'2 / 3');
 }
 await page.keyboard.press('Escape');assert.equal(await page.locator('.photo-dialog').count(),0);assert.equal(await page.locator('.photo-count').textContent(),'2 / 3');assert.equal(await page.evaluate(()=>document.activeElement.className),'photo-frame');const after=await page.evaluate(()=>scrollY);assert.ok(Math.abs(after-before)<=1,`scroll before=${before} after=${after}`);
 if(width===390&&!review){
  const fresh=async suffix=>{await page.evaluate(suffix=>{viewer.destroy();window.viewer=reviewGallery([{src:'https://photos.test/thumb2',originalSrc:'https://photos.test/original2?'+suffix,kind:'image'}]);viewer.element.classList.add('feed-gallery');document.querySelector('main').replaceChildren(viewer.element);},suffix);await page.waitForFunction(()=>document.querySelector('.photo-frame img').naturalWidth>0);};
  fail=true;await fresh('failure');await page.locator('.photo-frame').click();await page.getByRole('button',{name:'다시 불러오기',exact:true}).waitFor();fail=false;await page.getByRole('button',{name:'다시 불러오기',exact:true}).click();await ready();assert.equal(await page.evaluate(()=>document.activeElement.className),'photo-viewer-stage');
  await page.locator('.photo-close').click();
  await fresh('timeout');await page.clock.install();slow=true;await page.locator('.photo-frame').click();await page.clock.fastForward(16000);await page.getByRole('button',{name:'다시 불러오기',exact:true}).waitFor();
  await page.evaluate(()=>viewer.destroy());assert.equal(await page.locator('.photo-dialog').count(),0);assert.notEqual(await page.evaluate(()=>document.documentElement.style.overflow),'hidden');
  slow=false;await page.evaluate(()=>{window.viewer=reviewGallery(['image','video','image'].map((kind,i)=>({src:'https://photos.test/mixed'+i,kind,url:'https://x.com/sample/status/1'})));viewer.element.classList.add('feed-gallery');document.querySelector('main').replaceChildren(viewer.element);});await page.waitForFunction(()=>document.querySelector('.photo-frame img').naturalWidth>0);await page.locator('.photo-frame').click();await ready();assert.equal(await page.locator('.photo-viewer-count').textContent(),'1 / 2');await page.getByRole('button',{name:'다음 사진',exact:true}).click();await ready();await page.locator('.photo-close').click();assert.equal(await page.locator('.photo-count').textContent(),'3 / 3','photo-only modal maps back to mixed gallery index');
 }
 assert.deepEqual(errors,[]);console.log(`PASS ${width}x${height}${review?' review':''}: fullscreen, photo navigation, keyboard, swipe, fit, scroll/focus restoration and recovery`);await page.close();
}}finally{await browser.close();}
