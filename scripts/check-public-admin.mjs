import {createServer} from 'node:http';
import {readFileSync, mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const root=new URL('../',import.meta.url);
const requests=[];
let scenario='visitor',releaseSession;const sourceResolvers=[];
const source={source:'Seowoo_0501',enabled:1,collection_enabled:1,revision:1,last_success_at:1_700_000_000,last_received_count:2,last_matched_count:1,last_review_count:0,last_error_code:null,catchup_status:'current',next_due_at:null};
const publicSource={source:'Seowoo_0501',state:'ok',lastSuccessAt:'2023-11-14T22:13:20.000Z'};
const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
const server=createServer(async(req,res)=>{try{
 const path=new URL(req.url,'http://127.0.0.1:4191').pathname;requests.push(path);
 if(path==='/api/feed'){json(res,200,{posts:[],total:0,nextCursor:null,collectedAt:null});return;}
 if(path==='/api/session'){
  if(scenario==='slow-owner')await new Promise(r=>releaseSession=r);
  if(scenario==='session-failure'){json(res,503,{error:'unavailable'});return;}
  json(res,200,{role:scenario==='visitor'?'visitor':'owner'});return;
 }
 if(path==='/api/collection-status'){json(res,200,{sources:[publicSource]});return;}
 if(path==='/api/sources'){
  if(scenario==='expiring-owner')await new Promise(r=>sourceResolvers.push(r));
  if(scenario==='expired'){json(res,403,{error:'forbidden'});return;}
  json(res,200,{sources:[source]});return;
 }
 const file=path.slice(1)||'feed.html';if(!['feed.html','feed.js','feed.css','review-gallery.js'].includes(file)){res.writeHead(404).end();return;}
 res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html'});res.end(readFileSync(new URL('validation/'+file,root)));
 }catch(error){res.writeHead(500).end(error.message);}
});
await new Promise(r=>server.listen(4191,'127.0.0.1',r));let browser;
const goto=async(page,next)=>{scenario=next;requests.length=0;await page.goto('http://127.0.0.1:4191/feed.html?data=live');};
try{
 browser=await chromium.launch({headless:true,channel:'chrome'});mkdirSync('.local',{recursive:true});
 const page=await browser.newPage({viewport:{width:390,height:850}});const errors=[];page.on('pageerror',e=>errors.push(e.message));

 console.log('CHECK: delayed owner');scenario='slow-owner';requests.length=0;const navigation=page.goto('http://127.0.0.1:4191/feed.html?data=live');await page.locator('#open-status').waitFor();
 assert.equal(await page.locator('.review-entry').isVisible(),false);assert.equal(await page.locator('#tools-tab').isVisible(),false);assert.equal(await page.locator('#manual-form').isVisible(),false);
 releaseSession();await navigation;await page.locator('.review-entry').waitFor({state:'visible'});

 console.log('CHECK: site information');await goto(page,'visitor');
 for(const width of [320,390,1280]){
  await page.setViewportSize({width,height:850});await page.locator('#open-about').click();
  await page.getByRole('dialog',{name:'사이트 안내',exact:true}).waitFor();
  assert.equal(await page.locator('#contact-address').textContent(),'wantraiseapomeranian9@gmail.com');
  assert.match(await page.locator('#contact-email').getAttribute('href'),/^mailto:wantraiseapomeranian9@gmail\.com\?subject=/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.equal(await page.locator('#about-dialog').evaluate(el=>el.scrollWidth>el.clientWidth),false);
  await page.screenshot({path:`.local/site-info-${width}.png`});
  await page.keyboard.press('Escape');assert.equal(await page.locator('#about-dialog').isVisible(),false);
  assert.equal(await page.locator('#open-about').evaluate(el=>el===document.activeElement),true);
 }
 await page.locator('#open-about').click();await page.locator('#close-about').click();
 assert.equal(await page.locator('#about-dialog').isVisible(),false);
 console.log('CHECK: request context and clipboard');
 const originalUrl='https://x.com/example/status/123?ref=a&other=b';
 await page.route('**/api/feed*',route=>route.fulfill({json:{posts:[{id:'request-fixture',manual:true,platform:'x',media:[],canonicalUrl:originalUrl,publishedAt:'2026-09-11T00:00:00Z',contentKind:'other',caption:'',authorHandle:'example'}],total:1,nextCursor:null}}));
 await goto(page,'visitor');await page.locator('.rights-request').click();
 const mail=new URL(await page.locator('#contact-email').getAttribute('href'));
 assert.equal(mail.searchParams.get('body').includes(originalUrl),true);
 await page.context().grantPermissions(['clipboard-read','clipboard-write']);
 await page.locator('#copy-contact').click();await page.getByText('이메일 주소를 복사했어요.',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'wantraiseapomeranian9@gmail.com');
 await page.locator('#close-about').click();await page.locator('#open-about').click();
 assert.equal(new URL(await page.locator('#contact-email').getAttribute('href')).searchParams.get('body').includes(originalUrl),false);
 await page.unroute('**/api/feed*');
 console.log('CHECK: visitor');await goto(page,'visitor');await page.locator('#open-status').click();await page.locator('#source-status .source-row').waitFor();
 assert.equal(await page.locator('#status-title').textContent(),'수집 현황');assert.equal(await page.getByRole('button',{name:/수집 (중지|켜기)/}).count(),0);
 assert.equal(await page.locator('#tools-tab').isVisible(),false);assert.equal(requests.includes('/api/sources'),false);assert.equal(requests.includes('/api/collection-status'),true);
 assert.equal(await page.locator('#collection-panel').getAttribute('role'),'region');assert.equal(await page.locator('#collection-panel').getAttribute('aria-labelledby'),'status-title');
 await page.screenshot({path:'.local/public-visitor-390.png'});
 await page.setViewportSize({width:1280,height:800});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:'.local/public-visitor-1280.png'});

 console.log('CHECK: owner');await goto(page,'owner');await page.locator('.review-entry').waitFor({state:'visible'});await page.locator('#open-status').click();await page.locator('#tools-tab').waitFor({state:'visible'});await page.getByRole('button',{name:'Seowoo_0501 수집 중지',exact:true}).waitFor();
 assert.equal(await page.locator('#status-title').textContent(),'수집 및 관리');assert.equal(requests.includes('/api/sources'),true);
 await page.screenshot({path:'.local/public-owner-1280.png'});
 await page.setViewportSize({width:390,height:850});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:'.local/public-owner-390.png'});

 console.log('CHECK: session failure');await goto(page,'session-failure');await page.locator('#count').filter({hasText:'0개 게시물'}).waitFor();assert.equal(await page.locator('#tools-tab').isVisible(),false);assert.equal(requests.includes('/api/sources'),false);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.setViewportSize({width:1280,height:800});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);

 console.log('CHECK: expiry');await goto(page,'expiring-owner');await page.locator('.review-entry').waitFor({state:'visible'});await page.locator('#open-status').click();await page.locator('#tools-tab').waitFor({state:'visible'});await page.waitForTimeout(30);scenario='expired';sourceResolvers.splice(0).forEach(resolve=>resolve());
 await page.getByText('관리자 로그인이 필요해요.',{exact:true}).waitFor();await page.waitForTimeout(30);
 assert.equal(await page.locator('#tools-tab').isVisible(),false);assert.equal(await page.getByRole('button',{name:/수집 (중지|켜기)/}).count(),0);assert.equal(await page.locator('#manual-url').inputValue(),'');assert.equal(await page.locator('#source-status details').count(),0);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.setViewportSize({width:390,height:850});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.equal(requests.filter(path=>path==='/api/collection-status').length>0,true);assert.deepEqual(errors,[]);
 console.log('PASS: visitor/owner separation, session fallback, expiry demotion, responsive layouts');
}finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
