import {chromium} from 'playwright';
import {readFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';

// Computed CSS retains author colors even when Auto Dark changes painted pixels.
// Compare screenshots of the real UI with the browser transformation on/off.
const browser=await chromium.launch({channel:'chrome',headless:true});
const files=['feed','x-review','instagram','youtube','review-history','operations'];
mkdirSync('.local/forced-dark',{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
 await page.route('http://theme.test/**',route=>{
  const name=new URL(route.request().url()).pathname.slice(1);
  if(!/^[\w-]+\.(html|css|js)$/.test(name))return route.fulfill({status:404,body:''});
  if(name.endsWith('.js')&&!['theme.js','date-controls.js','review-gallery.js'].includes(name))return route.fulfill({contentType:'text/javascript',body:''});
  return route.fulfill({contentType:name.endsWith('.html')?'text/html':name.endsWith('.css')?'text/css':'text/javascript',body:readFileSync('validation/'+name,'utf8')});
 });
 const cdp=await page.context().newCDPSession(page);
 // Reproduce the reported OS-dark case. Chrome's CDP override ignores the
 // opt-out with an OS-light preference even on a standalone only-light page.
 for(const system of ['dark']){
  await page.emulateMedia({colorScheme:system});
  await page.goto('http://theme.test/feed.html');
  await page.getByRole('button',{name:'화면 설정',exact:true}).waitFor();
  await page.evaluate(()=>{
   const src='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="#739bb5"/></svg>');
   const viewer=reviewGallery([{src},{src}],{priority:true});viewer.element.classList.add('feed-gallery');
   document.querySelector('#gallery').replaceChildren(viewer.element);
   document.querySelector('#month-panel').hidden=false;
  });
  await page.waitForFunction(()=>document.querySelector('.photo-frame img').naturalWidth>0);
  for(const preference of ['light','dark','system','light']){
   await cdp.send('Emulation.setAutoDarkModeOverride',{enabled:true});
   await page.getByRole('button',{name:'화면 설정',exact:true}).click();
   await page.getByRole('radio',{name:{light:'밝게',dark:'어둡게',system:'기기 설정'}[preference],exact:true}).check();
   // Native dialog focus restoration precedes its queued close event, whose
   // app handler focuses the launcher again. Wait for both before capture.
   await page.evaluate(()=>{window.themeClosed=new Promise(resolve=>document.querySelector('#theme-dialog').addEventListener('close',()=>resolve(),{once:true}));});
   await page.keyboard.press('Escape');await page.evaluate(()=>window.themeClosed);
   await page.evaluate(()=>document.activeElement.blur());await page.mouse.move(0,0);
   const expected=preference==='system'?system:preference;
   assert.equal(await page.locator('html').getAttribute('data-theme'),expected);
   const forced=await page.screenshot({animations:'disabled',caret:'hide',path:`.local/forced-dark/${system}-${preference}-forced.png`});
   await cdp.send('Emulation.setAutoDarkModeOverride',{enabled:false});
   const normal=await page.screenshot({animations:'disabled',caret:'hide',path:`.local/forced-dark/${system}-${preference}-normal.png`});
   assert.ok(normal.equals(forced),`OS ${system}, selected ${preference}: browser must preserve painted page/text/control/image colors`);
   // Keep Auto Dark enabled across a reload to cover stored selection at first paint.
   await cdp.send('Emulation.setAutoDarkModeOverride',{enabled:true});
   await page.reload();await page.getByRole('button',{name:'화면 설정',exact:true}).waitFor();
   assert.equal(await page.locator('html').getAttribute('data-theme'),expected);
   // Restore the same fixture for the next transition.
   await page.evaluate(()=>{
    const src='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="#739bb5"/></svg>');
    const viewer=reviewGallery([{src},{src}],{priority:true});viewer.element.classList.add('feed-gallery');document.querySelector('#gallery').replaceChildren(viewer.element);document.querySelector('#month-panel').hidden=false;
   });
   await page.waitForFunction(()=>document.querySelector('.photo-frame img').naturalWidth>0);
   const restored=await page.screenshot({animations:'disabled',caret:'hide',path:`.local/forced-dark/${system}-${preference}-restored.png`});
   assert.ok(normal.equals(restored),`${preference}: stored theme must preserve painted colors after reload`);
   console.log(`PASS OS ${system}, selected ${preference}: painted colors and stored selection`);
  }
 }
 for(const name of files){
  await page.goto(`http://theme.test/${name}.html`);
  const supported=(await page.locator('meta[name="color-scheme"]').getAttribute('content')).split(/\s+/);
  assert.ok(supported.includes('light')&&supported.includes('dark'),name+' declares both site themes');
 }
 console.log('PASS theme support declared on all six screens (Chrome Auto Dark emulation; Samsung device not verified)');
}finally{await browser.close();}
