import {chromium} from 'playwright';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage();
const image='<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="#ccdfe5"/></svg>';
let release,slowCount=0;const gate=new Promise(r=>release=r);
await page.route('https://images.example.test/**',async route=>{
 if(route.request().url().endsWith('/slow')&&slowCount++===0)await gate;
 if(route.request().url().endsWith('/bad'))return route.fulfill({status:404,body:''});
 await route.fulfill({contentType:'image/svg+xml',body:image}).catch(()=>{});
});
try{
 await page.setContent('<main></main>');await page.addScriptTag({content:readFileSync('validation/review-gallery.js','utf8')});await page.clock.install();
 await page.evaluate(()=>{window.viewer=reviewGallery(['first','slow','bad','last'].map(name=>({src:'https://images.example.test/'+name})),{label:'검증 사진'});document.querySelector('main').append(viewer.element)});
 await page.waitForFunction(()=>document.querySelector('img').naturalWidth>0);
 await page.getByRole('button',{name:'검증 사진 다음',exact:true}).click();await page.clock.fastForward(200);
 assert.equal(await page.locator('.is-loading').count(),1);
 await page.clock.fastForward(20000);
 assert.equal(await page.locator('.is-loading').count(),0,'stalled image must end loading');
 await page.getByRole('button',{name:'검증 사진 다시 불러오기',exact:true}).click();release();
 await page.waitForFunction(()=>document.querySelector('img').naturalWidth>0&&!document.querySelector('img').hidden);
 await page.getByRole('button',{name:'검증 사진 다음',exact:true}).click();await page.locator('.photo-fallback').waitFor({state:'visible'});
 assert.equal(await page.locator('.is-loading').count(),0);assert.equal(await page.getByRole('button',{name:'검증 사진 다시 불러오기',exact:true}).count(),1);
 await page.getByRole('button',{name:'검증 사진 다음',exact:true}).click();await page.waitForFunction(()=>document.querySelector('img').naturalWidth>0&&!document.querySelector('img').hidden);
 assert.equal(await page.locator('.photo-count').textContent(),'4 / 4');
 await page.evaluate(()=>viewer.destroy());await page.clock.fastForward(30000);assert.equal(await page.locator('.is-loading').count(),0);
 await page.evaluate(()=>{document.querySelector('main').replaceChildren();const spacer=document.createElement('div');spacer.style.height='50000px';document.querySelector('main').append(spacer);window.offscreen=reviewGallery([{src:'https://images.example.test/offscreen'}],{label:'아래 사진'});document.querySelector('main').append(offscreen.element)});
 await page.clock.fastForward(20000);assert.ok(await page.locator('main img').getAttribute('src'),'offscreen lazy image must keep its source');
 assert.equal(await page.getByRole('button',{name:'아래 사진 다시 불러오기',exact:true}).count(),0);
 await page.locator('main img').scrollIntoViewIfNeeded();await page.waitForFunction(()=>document.querySelector('main img').naturalWidth>0);
 console.log('PASS stalled image timeout/retry, HTTP error/recovery, navigation, destroy');
}finally{release();await browser.close()}
