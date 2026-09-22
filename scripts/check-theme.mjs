import {createServer} from 'node:http';
import {readFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const files=['feed','x-review','instagram','youtube','review-history','operations'];
const server=createServer((req,res)=>{const name=new URL(req.url,'http://local').pathname.slice(1);if(!/^[\w-]+\.(html|css|js)$/.test(name)){res.writeHead(404).end();return;}try{res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(readFileSync('validation/'+name));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},colorScheme:'dark',userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1'});
await context.route('**/*',r=>{const u=new URL(r.request().url());if(u.pathname.endsWith('.js')&&!['/theme.js','/date-controls.js'].includes(u.pathname))return r.fulfill({contentType:'text/javascript',body:''});return r.continue();});
const page=await context.newPage();page.setDefaultTimeout(3500);const errors=[];page.on('pageerror',e=>errors.push(e.message));
const base=`http://127.0.0.1:${server.address().port}`;
const resolved=()=>page.locator('html').getAttribute('data-theme');
try{
 await page.goto(base+'/feed.html');
 assert.equal(await resolved(),'light','first visit must stay light even on a dark OS');
 for(const file of files){
  await page.goto(base+'/'+file+'.html');
  await page.getByRole('button',{name:'화면 설정',exact:true}).click();
  await page.getByRole('radio',{name:'어둡게',exact:true}).check();
  assert.equal(await resolved(),'dark');
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('button',{name:'화면 설정',exact:true}).evaluate(e=>e===document.activeElement),true);
  for(const width of [320,390,768,1280]){
   await page.setViewportSize({width,height:900});await page.getByRole('button',{name:'화면 설정',exact:true}).click();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,file+':'+width);
   assert.equal(await page.locator('#theme-dialog').evaluate(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight}),true);
   await page.keyboard.press('Escape');
  }
  const colors=await page.locator('input[type=date]').evaluateAll(es=>es.map(e=>({bg:getComputedStyle(e.closest('.date-display')?.querySelector('.date-value')||e).backgroundColor,page:getComputedStyle(document.body).backgroundColor})));
  colors.forEach(c=>assert.equal(c.bg,c.page,file+' date background'));
  await page.reload();assert.equal(await resolved(),'dark');console.log('PASS themes/layout/date',file);
 }
 await page.getByRole('button',{name:'화면 설정',exact:true}).click();await page.getByRole('radio',{name:'기기 설정',exact:true}).check();
 await page.emulateMedia({colorScheme:'light'});await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');await page.emulateMedia({colorScheme:'dark'});await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
 await page.getByRole('radio',{name:'밝게',exact:true}).check();await page.emulateMedia({colorScheme:'light'});await page.emulateMedia({colorScheme:'dark'});assert.equal(await resolved(),'light');
 const other=await context.newPage();await other.goto(base+'/feed.html');await other.getByRole('button',{name:'화면 설정',exact:true}).click();await other.getByRole('radio',{name:'어둡게',exact:true}).check();await page.bringToFront();await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');await other.close();
 await page.evaluate(()=>localStorage.setItem('seoyeon-theme','bad'));await page.reload();assert.equal(await resolved(),'light');
 await page.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw new Error('blocked')}}));await page.reload();await page.getByRole('button',{name:'화면 설정',exact:true}).click();await page.getByRole('radio',{name:'어둡게',exact:true}).check();assert.equal(await resolved(),'dark');
 await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.theme-choice svg').first().evaluate(e=>getComputedStyle(e).animationName),'none');
 mkdirSync('.local/theme',{recursive:true});
 const axePath=process.argv[process.argv.indexOf('--axe')+1];
 if(process.argv.includes('--axe')){
  await page.addScriptTag({content:readFileSync(axePath,'utf8')});
  for(const choice of ['밝게','어둡게']){await page.getByRole('radio',{name:choice,exact:true}).check();const failures=await page.evaluate(async()=>{const r=await axe.run(document.querySelector('#theme-dialog'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}});return r.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}));});assert.deepEqual(failures,[],choice);}
  console.log('PASS axe theme dialog light/dark');
 }
 for(const width of [390,768,1280]){await page.setViewportSize({width,height:844});await page.screenshot({path:`.local/theme/${width}.png`,fullPage:true});}
 await page.setViewportSize({width:320,height:600});await page.locator('#theme-dialog').evaluate(d=>{const es=[d,...d.querySelectorAll('*')],sizes=es.map(e=>parseFloat(getComputedStyle(e).fontSize));es.forEach((e,i)=>e.style.fontSize=sizes[i]*2+'px');});
 assert.equal(await page.locator('#theme-dialog').evaluate(e=>e.scrollWidth>e.clientWidth),false,'200% text must wrap');
 assert.deepEqual(errors,[]);console.log('PASS system/manual/storage/blocked storage/reduced motion');
}finally{await browser.close();server.closeAllConnections();server.close();}
