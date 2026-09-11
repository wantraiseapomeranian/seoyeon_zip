import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const assets=new URL('../validation/',import.meta.url);
let role='owner';
const server=createServer((req,res)=>{
 const path=new URL(req.url,'http://localhost').pathname;
 if(path.startsWith('/api/')){
  res.setHeader('Content-Type','application/json');
  const data=path==='/api/session'?{role}:path==='/api/feed'?{posts:[{id:'audit',manual:true,platform:'x',media:[],canonicalUrl:'https://x.com/example/status/1',publishedAt:'2026-09-11T00:00:00Z',contentKind:'other',caption:'',authorHandle:'example'}],total:1,nextCursor:null}:path==='/api/admin/instagram/sync'?{status:'waiting'}:{items:[],total:0,authors:[],counts:{pending:0,visible:0,hidden:0,all:0,kept:0,held:0,excluded:0}};
  return res.end(JSON.stringify(data));
 }
 const file=({'/':'feed.html','/admin/x':'x-review.html','/admin/instagram':'instagram.html'})[path]??path.slice(1);
 if(!['feed.html','feed.js','feed.css','instagram.html','instagram.js','instagram.css','x-review.html','x-review.js','review-gallery.js'].includes(file)){res.writeHead(404).end();return;}
 res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(readFileSync(new URL(file,assets)));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
let browser;
try{
 browser=await chromium.launch({headless:true,channel:'chrome'});
 const page=await browser.newPage();
 for(const currentRole of ['visitor','owner'])for(const route of ['/',...(currentRole==='owner'?['/admin/x','/admin/instagram']:[])])for(const width of [320,390,768,1280]){
  role=currentRole;await page.setViewportSize({width,height:844});await page.goto(origin+route);
  if(route==='/')await page.locator(role==='owner'?'.review-entry':'#login-link').waitFor({state:'visible'});
  const result=await page.evaluate(()=>{
   const failures=[];
   for(const button of document.querySelectorAll('header .actions .icon-button,.feed-actions .icon-button')){
    if(!button.getClientRects().length)continue;
    const svg=button.querySelector('svg'),bounds=svg.getBoundingClientRect();
    const shapes=[...svg.querySelectorAll('path,rect,circle')];
    for(let x=bounds.left;x<bounds.right;x+=.5)for(let y=bounds.top;y<bounds.bottom;y+=.5){
     const painted=shapes.some(shape=>{const point=new DOMPoint(x,y).matrixTransform(shape.getScreenCTM().inverse()),style=getComputedStyle(shape);return (style.fill!=='none'&&shape.isPointInFill(point))||(style.stroke!=='none'&&shape.isPointInStroke(point));});
     if(painted&&!button.contains(document.elementFromPoint(x,y))){failures.push(JSON.stringify({label:button.getAttribute('aria-label'),x,y,bounds:button.getBoundingClientRect().toJSON(),hit:document.elementFromPoint(x,y)?.outerHTML.slice(0,140)}));break;}
    }
   }
   const buttons=[...document.querySelectorAll('header .actions .icon-button')].filter(b=>b.getClientRects().length),last=buttons.at(-1);
   const edge=Math.max(...[...last.querySelectorAll('path,rect,circle')].map(shape=>{const box=shape.getBBox(),stroke=getComputedStyle(shape).stroke==='none'?0:parseFloat(getComputedStyle(shape).strokeWidth)/2;return new DOMPoint(box.x+box.width+stroke,0).matrixTransform(shape.getScreenCTM()).x;}));
   return {failures:[...new Set(failures)],edgeGap:document.querySelector('header').getBoundingClientRect().right-edge,overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth};
  });
  assert.deepEqual(result.failures,[],`${currentRole} ${route} ${width}: painted icon must hit its own button`);
  assert.ok(Math.abs(result.edgeGap)<.1,JSON.stringify(result));assert.equal(result.overflow,false);
  if(route!=='/'){
   await page.locator('#tabs button span').evaluateAll(spans=>spans.forEach(s=>s.textContent='2018'));
   assert.equal(await page.locator('#tabs').evaluate(e=>e.scrollWidth>e.clientWidth),false,`${route} ${width}: all status tabs fit without horizontal scrolling`);
  }
 }
 // Exercise the shared photo viewer without changing any server data.
 await page.evaluate(()=>{
  const gallery=window.reviewGallery([{src:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>',kind:'image'}],{label:'감사 사진'});
  document.body.append(gallery.element);
 });
 const trigger=page.getByRole('button',{name:'감사 사진 확대',exact:true});await trigger.click();
 await page.getByRole('dialog',{name:'감사 사진 확대',exact:true}).waitFor();
 await page.keyboard.press('Escape');assert.equal(await trigger.evaluate(e=>e===document.activeElement),true);
 await page.getByRole('button',{name:'결과 가져오기',exact:true}).click();
 await page.getByRole('dialog',{name:'수집 결과 가져오기',exact:true}).waitFor();
 await page.setViewportSize({width:320,height:568});
 assert.equal(await page.locator('#close-import').evaluate(e=>{const range=document.createRange();range.selectNodeContents(e);return range.getClientRects().length;}),1,'close label stays on one line');
 let importRequests=0;page.on('request',request=>{if(request.method()==='POST'&&request.url().includes('/import'))importRequests++;});
 await page.locator('#import-submit').click();await page.getByRole('alert').filter({hasText:'올바른 JSON 내용을 입력해 주세요.'}).waitFor();
 assert.equal(importRequests,0,'empty input is rejected before any import request');
 assert.equal(await page.locator('#import-dialog').evaluate(e=>e.scrollWidth>e.clientWidth),false);
 await page.keyboard.press('Escape');assert.equal(await page.locator('#open-import').evaluate(e=>e===document.activeElement),true);
 console.log('PASS: visible icon hit targets and right edges at 320/390/768/1280px; named dialogs and focus return');
}finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
