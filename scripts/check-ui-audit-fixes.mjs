import {createServer} from 'node:http';
import {readFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const fixture=readFileSync('scripts/check-review-audit.mjs','utf8');
const {x,ig}=new Function(fixture.slice(fixture.indexOf('const image='),fixture.indexOf('let browser;'))+';return {x,ig};')();
const yt={videoId:'Audit123456',revision:1,url:'https://www.youtube.com/watch?v=Audit123456',decision:'pending',category:'fancam',format:'regular',availability:'available',metadata:{title:'검수 영상',channelTitle:'검수 채널',publishedAt:'2026-09-20',durationSeconds:190}};
const server=createServer((req,res)=>{const file=new URL(req.url,'http://local').pathname.slice(1);if(!/^[\w-]+\.(html|css|js)$/.test(file)){res.writeHead(404).end();return;}try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(readFileSync('validation/'+file));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(5000);
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('https://**/*',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"/>'}));
const mode=process.argv[2]||'focus';
try{
 for(const [name,file,buttonName] of [['x','x-review.html','숨기기'],['ig','instagram.html','제외'],['yt','youtube.html','보류']]){
  if(mode==='text'&&name!=='yt')continue;
  for(const scenario of mode==='text'?['keep']:['keep','next','empty','moved','cancel']){
   if(name==='yt'&&scenario==='cancel')continue;
   let saved=false,release,started;const reloadStarted=new Promise(r=>started=r);
   const initial=name==='x'?{...x,comparisons:[]}:name==='ig'?ig:yt;
   const second=name==='x'?{...initial,id:'x:second',authorHandle:'second'}:name==='ig'?{...initial,code:'second',author:'second'}:{...initial,videoId:'Second12345',metadata:{...yt.metadata,title:'두 번째 영상'}};
   await page.route('**/api/**',async r=>{
    if(r.request().method()!=='GET'){saved=true;return r.fulfill({json:{saved:true}});}
    if(r.request().url().endsWith('/sync'))return r.fulfill({json:{status:'waiting'}});
    if(saved&&scenario==='moved'){started();await new Promise(r=>release=r);}
    const items=!saved||scenario==='keep'||scenario==='moved'?[initial,second]:scenario==='next'?[second]:[];
    const counts=name==='x'?{pending:items.length,all:items.length,visible:0,hidden:0}:{pending:items.length,kept:0,held:0,excluded:0};
    await r.fulfill({json:name==='yt'?{posts:items,counts:[{decision:'pending',count:items.length}],enabled:true,nextCursor:null}:{items,counts,total:items.length,authors:[],groupRevision:1}});
   });
   await page.goto(`http://127.0.0.1:${server.address().port}/${file}`);await page.locator('.review-card').first().waitFor();
   if(mode==='text'){
    await page.evaluate(()=>{const elements=[...document.querySelectorAll('body *')].filter(e=>e.getClientRects().length);const sizes=elements.map(e=>parseFloat(getComputedStyle(e).fontSize));elements.forEach((e,i)=>e.style.fontSize=sizes[i]*2+'px');});
    for(const width of [320,390]){
     await page.setViewportSize({width,height:844});
     const overflow=await page.locator('.review-buttons button').evaluateAll(bs=>bs.filter(b=>b.scrollWidth>b.clientWidth+1).map(b=>b.textContent));
     assert.deepEqual(overflow,[],`text at ${width}`);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    }
    console.log('PASS YouTube all text 200% at 320/390px');break;
   }
   await page.evaluate(()=>window.__initialCard=document.querySelector('.review-card'));
   const button=page.getByRole('button',{name:buttonName,exact:true}).first();await button.focus();await page.keyboard.press('Enter');
   if(name!=='yt')await page.getByRole('button',{name:scenario==='cancel'?'취소':'판단 저장',exact:true}).click();
   if(scenario==='cancel'){await page.waitForFunction(()=>!document.querySelector('dialog[open]'));assert.equal(await button.evaluate(e=>e===document.activeElement),true);}
   else{
    if(scenario==='moved'){await reloadStarted;await page.locator('h1').evaluate(e=>{e.tabIndex=-1;e.focus();});release();}
    await page.waitForFunction(()=>document.querySelector('.review-card')!==window.__initialCard);
    await page.waitForTimeout(180);
    const active=await page.evaluate(()=>({tag:document.activeElement.tagName,inCard:!!document.activeElement.closest('.review-card'),cardIndex:[...document.querySelectorAll('.review-card')].indexOf(document.activeElement.closest('.review-card')),empty:!!document.activeElement.closest('#empty')||document.activeElement.id==='youtube-notice'}));
    if(scenario==='moved')assert.equal(active.tag,'H1',`${name} preserves user focus`);
    else if(scenario==='empty')assert.equal(active.empty,true,`${name} empty fallback`);
    else{assert.equal(active.inCard,true,`${name} ${scenario}: focus stays in review flow`);assert.equal(active.cardIndex,0);}
   }
   await page.unroute('**/api/**');console.log('PASS',name,scenario);
  }
 }
 assert.deepEqual(errors,[]);mkdirSync('.local/ui-fixes',{recursive:true});await page.screenshot({path:'.local/ui-fixes/'+mode+'.png',fullPage:true});
}finally{await browser.close();server.closeAllConnections();server.close();}
