import {chromium} from 'playwright';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

// Use coordinates: locator.click/tap may scroll the target before the gesture,
// hiding the focusin regression this check is meant to catch.
const browser=await chromium.launch({channel:'chrome',headless:true});
async function fixture(){
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 await page.route('http://photo.test/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><main style="width:350px;margin:20px"></main>'}));
 await page.goto('http://photo.test/');
 await page.addStyleTag({content:readFileSync('validation/feed.css','utf8')});
 for(const name of ['review-gallery','theme'])await page.addScriptTag({content:readFileSync(`validation/${name}.js`,'utf8')});
 await page.evaluate(()=>{
  for(let i=0;i<8;i++){
   const items=['gray','blue','green'].map(color=>({src:'data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="100%" height="100%" fill="${color}"/></svg>`)}));
   const viewer=reviewGallery(items,{managed:true,priority:i<2});
   viewer.element.classList.add('feed-gallery');viewer.element.style.marginBottom='60px';
   document.querySelector('main').append(viewer.element);
  }
 });
 await page.waitForFunction(()=>document.querySelector('img').naturalWidth>0);
 assert.match(await page.locator('.photo-frame').first().evaluate(e=>getComputedStyle(e).touchAction),/(?:^| )pinch-zoom(?: |$)/,'feed photos allow native pinch zoom');
 await position(page);
 await page.waitForFunction(()=>document.querySelectorAll('.photo-frame img')[3].naturalWidth>0);
 return page;
}
async function position(page){
 await page.evaluate(()=>{
  const arrow=document.querySelectorAll('.photo-arrow:last-child')[3].getBoundingClientRect();
  const launcher=document.querySelector('.theme-launch').getBoundingClientRect();
  // Arrow center remains tappable, but its lower edge overlaps the launcher.
  scrollTo(0,scrollY+arrow.top+arrow.height/2-(launcher.top-8));
 });
}
async function activate(page,selector,method){
 const r=await page.locator(selector).nth(3).boundingBox();
 const x=r.x+r.width/2,y=r.y+r.height/2;
 if(method==='touch')await page.touchscreen.tap(x,y);else await page.mouse.click(x,y);
}
try{
 for(const method of ['touch','mouse'])for(const action of ['next','preview']){
  const page=await fixture();
  try{
   // A pointer must cancel the previous keyboard input mode as well.
   await page.keyboard.press('Tab');
   await page.locator(':focus').evaluate(e=>e.blur());await position(page);
   const before=await page.evaluate(()=>scrollY);
   await activate(page,action==='next'?'.photo-arrow:last-child':'.photo-frame',method);
   assert.equal(await page.evaluate(()=>scrollY),before,`${method} ${action} must retain scroll position`);
   if(action==='next')assert.equal(await page.locator('.photo-count').nth(3).textContent(),'2 / 3');
   else{
    await page.locator('.photo-dialog[open]').waitFor();
    const close=await page.locator('.photo-close').boundingBox();
    if(method==='touch')await page.touchscreen.tap(close.x+close.width/2,close.y+close.height/2);
    else await page.mouse.click(close.x+close.width/2,close.y+close.height/2);
    await page.waitForFunction(()=>!document.querySelector('.photo-dialog'));
    assert.equal(await page.evaluate(()=>scrollY),before,`${method} preview close must retain scroll position`);
    assert.equal(await page.locator('.photo-frame').nth(3).evaluate(e=>e===document.activeElement),true);
   }
   console.log(`PASS ${method} ${action}: scroll stable, action completed`);
  }finally{await page.close();}
 }
 const page=await fixture();
 try{
  await page.locator('.photo-frame').nth(3).evaluate(e=>e.focus({preventScroll:true}));
  await position(page);await page.keyboard.press('Tab');
  assert.equal(await page.locator('.photo-arrow:last-child').nth(3).evaluate(e=>e===document.activeElement),true);
  assert.equal(await page.locator('.photo-arrow:last-child').nth(3).evaluate(e=>{
   const r=e.getBoundingClientRect(),b=document.querySelector('.theme-launch').getBoundingClientRect();
   return r.bottom>b.top&&r.top<b.bottom&&r.right>b.left&&r.left<b.right;
  }),false,'keyboard focus must remain unobscured');
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('.photo-count').nth(3).textContent(),'2 / 3');
  console.log('PASS keyboard focus is visible and next photo works');
 }finally{await page.close();}
}finally{await browser.close();}
