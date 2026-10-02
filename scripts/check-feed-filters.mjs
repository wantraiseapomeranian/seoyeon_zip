import {createServer} from 'node:http';
import {readFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {testDatabase} from '../tests/helpers/d1.mjs';
import {readFeed} from '../src/feed.mjs';
const {DB,sqlite}=testDatabase();
for(let n=1;n<=52;n++){
 const p={id:'x:'+n,authorHandle:'writer',observedViaSource:'collector',canonicalUrl:'https://x.com/writer/status/'+n,publishedAt:'2026-09-22T00:00:00Z',contentKind:'fansite',caption:'윤서연',media:[{kind:'image',previewUrl:'https://pbs.twimg.com/media/fixture.jpg',width:600,height:800}]};
 sqlite.prepare('INSERT INTO posts VALUES(?,?)').run(p.id,JSON.stringify(p));
}
for(const [code,author,kind] of [['insta1','photo.account','cosmo'],['insta2','other.account','fansite']])sqlite.prepare("INSERT INTO instagram_review(code,data,status,imported_at) VALUES(?,?,'kept','2026-09-22T00:00:00Z')").run(code,JSON.stringify({author,caption:'서연',contentKind:kind,publishedAt:'2026-09-22T00:00:00Z',url:'https://www.instagram.com/p/'+code+'/',images:['https://s.cdninstagram.com/'+code+'.jpg'],media:[{kind:'image'}]}));
let failFeed=false,delayInstagram=false;
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://local');
 if(url.pathname==='/api/feed'){
  if(delayInstagram&&url.searchParams.get('platform')==='instagram')await new Promise(r=>setTimeout(r,220));
  if(failFeed){res.writeHead(503).end();return;}
  try{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(await readFeed(DB,url.searchParams)));}catch(e){res.writeHead(e.status??500).end();}return;
 }
 if(url.pathname==='/api/session'){await new Promise(r=>setTimeout(r,120));res.setHeader('Content-Type','application/json');res.end(JSON.stringify({role:'owner'}));return;}
 if(url.pathname.startsWith('/api/')){res.writeHead(503).end();return;}
 const file=url.pathname.slice(1)||'feed.html';
 if(!/^[\w-]+\.(html|css|js)$/.test(file)){res.writeHead(404).end();return;}
 try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(readFileSync('validation/'+file));}catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({channel:'chrome',headless:true});
mkdirSync('.local/feed-filters',{recursive:true});
try{for(const width of [320,390,768,1280]){
 const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);
 await page.route(/https:\/\/(pbs\.twimg\.com|s\.cdninstagram\.com)\//,r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="#cce0e9"/></svg>'}));
 const count=async n=>page.waitForFunction(n=>document.querySelector('#count').textContent===n+'개 게시물'&&document.querySelector('#gallery').getAttribute('aria-busy')==='false',n);
 const open=async()=>{if(width<=600&&await page.locator('#filter-toggle').getAttribute('aria-expanded')==='false')await page.locator('#filter-toggle').click();};
 await page.goto('http://127.0.0.1:'+server.address().port+'/?data=live');await count(54);await open();
 const platform=page.getByRole('combobox',{name:'플랫폼',exact:true}),kind=page.getByRole('combobox',{name:'콘텐츠 종류',exact:true}),author=page.getByRole('combobox',{name:'작성 계정',exact:true});
 assert.equal(await platform.count(),1,'platform select exists');
 assert.deepEqual(await platform.locator('option').allTextContents(),['모든 플랫폼','X','Instagram']);
 assert.ok((await author.locator('option').allTextContents()).includes('@photo.account · Instagram'),'options survive collection endpoint failure and delayed owner login');
 await platform.selectOption('x');await count(52);assert.equal(await author.locator('option').count(),2);
 await author.selectOption('x:writer');await count(52);await kind.selectOption('fansite');await count(52);
 assert.equal(new URL(page.url()).searchParams.get('author'),'x:writer');
 await page.getByRole('button',{name:'더 보기',exact:true}).click();await count(52);assert.equal(await page.locator('.card').count(),52);
 await page.reload();await count(52);await open();assert.equal(await platform.inputValue(),'x');assert.equal(await author.inputValue(),'x:writer');
 await platform.selectOption('instagram');await count(1);assert.equal(await author.inputValue(),'all');
 assert.equal(await author.locator('option').count(),3,'author choices remain available across kind filters');
 await kind.selectOption('cosmo');await count(1);await author.selectOption('instagram:photo.account');await count(1);
 await page.screenshot({path:'.local/feed-filters/'+width+'.png'});
 const sizes=await page.locator('#aux-filters select').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {width:r.width,height:r.height,right:r.right,left:r.left};}));
 assert.ok(sizes.every(r=>r.height>=44&&r.left>=0&&r.right<=width),JSON.stringify(sizes));
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await kind.selectOption('official');await count(0);await page.locator('#reset').click();await count(54);assert.equal(await platform.inputValue(),'all');assert.equal(await author.inputValue(),'all');
 delayInstagram=true;await platform.selectOption('instagram');await platform.selectOption('x');await count(52);await page.waitForTimeout(260);await count(52);assert.equal(await author.locator('option').count(),2);delayInstagram=false;
 failFeed=true;await kind.selectOption('other');await page.getByText('목록 조회 실패',{exact:true}).waitFor();failFeed=false;await page.locator('#refresh').click();await count(0);await page.locator('#reset').click();await count(54);
 await page.getByRole('button',{name:'유튜브',exact:true}).click();await count(0);assert.equal(await page.locator('#aux-filters').isVisible(),false);assert.equal(new URL(page.url()).searchParams.has('platform'),false);assert.equal(new URL(page.url()).searchParams.has('author'),false);
 await page.getByRole('button',{name:'사진',exact:true}).click();await count(54);
 if(width<=390){
  // Fixed 44px targets must remain separate when text is doubled. Checking
  // real bounds catches shrinking flex groups and overflowing grid tracks.
  await page.evaluate(()=>{const es=[...document.querySelectorAll('body *')],sizes=es.map(e=>parseFloat(getComputedStyle(e).fontSize));es.forEach((e,i)=>e.style.fontSize=sizes[i]*2+'px');});
  await open();
  const controls=page.locator('header .brand-group a,header .brand-group button,header .actions a:not([hidden]),header .actions button,.media-tabs button,#filter-toggle,#aux-filters select,#month-trigger,.sort-options button');
  const bounds=await controls.evaluateAll(es=>es.filter(e=>e.getClientRects().length).map(e=>{const r=e.getBoundingClientRect();return {name:e.id||e.getAttribute('aria-label')||e.textContent.trim(),left:r.left,right:r.right,top:r.top,bottom:r.bottom};}));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`200% text must fit ${width}px`);
  assert.ok(bounds.every(r=>r.left>=0&&r.right<=width),JSON.stringify(bounds));
  for(let a=0;a<bounds.length;a++)for(let b=a+1;b<bounds.length;b++){
   const x=Math.min(bounds[a].right,bounds[b].right)-Math.max(bounds[a].left,bounds[b].left),y=Math.min(bounds[a].bottom,bounds[b].bottom)-Math.max(bounds[a].top,bounds[b].top);
   assert.ok(x<=1||y<=1,`200% targets overlap at ${width}px: ${bounds[a].name} / ${bounds[b].name}`);
  }
  await page.locator('#filter-toggle').focus();
  for(const id of ['platform','kind','author','month-trigger']){await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),id);}
  await page.keyboard.press('Enter');await page.locator('#month').waitFor({state:'visible'});await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'month');
  await page.locator('#month-trigger').press('Escape');await page.locator('#kind').selectOption('official');await count(0);await page.locator('#reset').focus();await page.keyboard.press('Enter');await count(54);
  const viewport=await page.locator('meta[name="viewport"]').getAttribute('content');assert.doesNotMatch(viewport,/user-scalable\s*=\s*no|maximum-scale\s*=\s*1(?:\D|$)/i,'viewport allows native zoom');
  await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'.local/feed-filters/'+width+'-text-200.png'});
  console.log('PASS '+width+': 200% text, separate header/filter/sort targets, keyboard filters/date/reset, native zoom permitted');
 }
 assert.deepEqual(errors,[]);console.log('PASS '+width+': platform, author, category, full options, paging, owner race, status failure, reload, stale response, retry, reset, YouTube separation and fit');await page.close();
}}finally{await browser.close();server.closeAllConnections();server.close();sqlite.close();}
