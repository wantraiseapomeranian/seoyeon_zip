import {createServer} from 'node:http';
import {readFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {testDatabase} from '../tests/helpers/d1.mjs';
import {handleApi} from '../src/worker.mjs';

// Real worker + SQLite fixture: only failure responses are injected at HTTP boundary.
const {DB,sqlite,enable}=testDatabase();enable();
sqlite.exec("UPDATE collection_state SET last_success_at=unixepoch()-180,last_attempt_at=unixepoch()-60,next_due_at=unixepoch()+180 WHERE enabled=1");
sqlite.exec("INSERT INTO instagram_sync(id,task_id,last_checked_at,last_success_at,next_due_at) VALUES(1,'testTask',datetime('now'),datetime('now','-1 day'),unixepoch()+300)");
sqlite.prepare('INSERT INTO manual_posts VALUES(?,?,?,?)').run('manual:x:123','https://x.com/sample/status/123','{}',new Date().toISOString());
sqlite.exec("INSERT INTO manual_media_jobs(post_id,state,error) VALUES('manual:x:123','failed','provider_network')");
const env={DB,COLLECTION_ENABLED:'true',APIFY_SYNC_ENABLED:'true',APIFY_TASK_ID:'testTask',APIFY_TOKEN:'local-test-only',MANUAL_MEDIA_ENABLED:'true'};
let mode='normal',reads=0,writes=0;
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1:4198');
  if(req.headers.host!=='127.0.0.1:4198'){res.writeHead(403).end();return;}
  if(req.method!=='GET')writes++;
  if(url.pathname==='/api/admin/operations'){
   reads++;
   if(mode==='error'||mode==='auth'){res.writeHead(mode==='auth'?401:503,{'Content-Type':'application/json'}).end('{}');return;}
   const response=await handleApi(new Request(url,{method:req.method}),env);
   const data=await response.json();
   if(mode==='history'||mode==='both')data.history={...data.history,status:'unavailable'};
   if(mode==='alerts'||mode==='both')data.alerts={...data.alerts,status:'unavailable'};
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(JSON.stringify(data));return;
  }
  const file=url.pathname==='/admin/operations'?'operations.html':url.pathname.slice(1);
  if(!['operations.html','operations.css','operations.js','feed.css'].includes(file)){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');
  res.end(readFileSync('validation/'+file));
 }catch(error){res.writeHead(500).end(error.message);}
});
await new Promise(resolve=>server.listen(4198,'127.0.0.1',resolve));
if(process.argv.includes('--serve')){
 console.log('Operations review fixture: http://127.0.0.1:4198/admin/operations (Ctrl+C to stop)');
 await new Promise(resolve=>process.once('SIGINT',resolve));
 await new Promise(resolve=>server.close(resolve));sqlite.close();process.exit(0);
}
let browser;
try{
 browser=await chromium.launch({headless:true,channel:'chrome'});
 const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(10000);
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 // Advancing the page clock catches background polling without a long real wait.
 await page.clock.install();
 const keys=['overview','collection','growth','alerts'];
 async function settled(){await page.waitForFunction(()=>document.querySelector('#operations-refresh').getAttribute('aria-disabled')==='false');}
 async function selected(key){
  for(const item of keys){
   const tab=page.locator('#ops-tab-'+item),panel=page.locator('#ops-panel-'+item);
   assert.equal(await tab.getAttribute('aria-selected'),String(item===key),'selected tab: '+item);
   assert.equal(await tab.getAttribute('tabindex'),item===key?'0':'-1','roving tabindex: '+item);
   assert.equal(await panel.isVisible(),item===key,'only selected panel visible: '+item);
  }
 }
 async function refresh(){const before=reads;await page.locator('#operations-refresh').click();await settled();assert.equal(reads,before+1);}
 await page.goto('http://127.0.0.1:4198/admin/operations');await settled();
 const sharedStyles=await page.evaluate(()=>({background:getComputedStyle(document.body).backgroundColor,font:getComputedStyle(document.body).fontFamily,refreshHeight:document.querySelector('#operations-refresh').getBoundingClientRect().height}));
 assert.equal(sharedStyles.background,'rgb(241, 245, 247)','shared feed stylesheet supplies the mist background');
 assert.match(sharedStyles.font,/Pretendard/,'shared typography must load before layout checks');
 assert.equal(sharedStyles.refreshHeight,44,'refresh control retains its shared 44px touch target');
 assert.equal(await page.getByRole('tablist').count(),1,'operations must expose a tablist');
 assert.equal(await page.getByRole('tab').count(),4);
 for(const [index,label] of ['요약','수집·사진','자료 증가','알림'].entries()){
  const tab=page.getByRole('tab',{name:label,exact:true});
  assert.equal(await tab.getAttribute('id'),'ops-tab-'+keys[index]);
  assert.equal(await tab.getAttribute('aria-controls'),'ops-panel-'+keys[index]);
  assert.equal(await page.locator('#ops-panel-'+keys[index]).getAttribute('role'),'tabpanel');
  assert.equal(await page.locator('#ops-panel-'+keys[index]).getAttribute('aria-labelledby'),'ops-tab-'+keys[index]);
 }
 await selected('overview');assert.equal(reads,1,'initial data uses one API read');
 assert.equal(await page.locator('#ops-panel-overview section').first().getAttribute('aria-labelledby'),'attention-title','actionable problems come first in DOM and reading order');
 assert.equal(await page.locator('#attention-summary').innerText(),'','no redundant prompt when issues are listed');
 assert.equal(await page.locator('#operations-status').getAttribute('role'),'status');
 assert.equal(await page.locator('#operations-status').evaluate(el=>getComputedStyle(el).position),'absolute','success announcement stays available without taking visual space');
 await page.locator('#ops-tab-collection').click();
 assert.match(await page.locator('#manual-values').innerText(),/조회 실패\s*1건/);
 for(const id of ['instagram-details','manual-details']){
  assert.equal(await page.locator('#'+id).getAttribute('open'),null,'secondary counts start collapsed');
  await page.locator('#'+id+' summary').click();
  assert.equal(await page.locator('#'+id+' dl').isVisible(),true);
 }
 assert.match(await page.locator('#manual-detail-values').innerText(),/사진 조회 완료/);
 assert.match(await page.locator('#instagram-detail-values').innerText(),/외부 실행 확인/);
 await refresh();
 for(const id of ['instagram-details','manual-details'])assert.notEqual(await page.locator('#'+id).getAttribute('open'),null,'refresh preserves disclosure state');
 await page.locator('#ops-tab-overview').click();
 sqlite.exec("UPDATE manual_media_jobs SET state='ready' WHERE post_id='manual:x:123'");
 await refresh();assert.equal(await page.locator('#operations-issues li').count(),0);
 assert.match(await page.locator('#attention-summary').innerText(),/확인이 필요한 항목은 없어요/);
 sqlite.exec("UPDATE manual_media_jobs SET state='failed' WHERE post_id='manual:x:123'");
 await refresh();assert.equal(await page.locator('#operations-issues li').count(),1);
 const initialReads=reads;
 assert.match(await page.locator('#total-values').innerText(),/직접 등록 자료\s*1건/);
 await page.locator('#ops-tab-overview').focus();
 for(const [key,expected] of [['ArrowRight','collection'],['End','alerts'],['ArrowRight','overview'],['ArrowLeft','alerts'],['Home','overview']]){
  await page.keyboard.press(key);await selected(expected);
  assert.equal(await page.evaluate(()=>document.activeElement.id),'ops-tab-'+expected,'keyboard focus follows selection');
 }
 for(const key of keys){await page.locator('#ops-tab-'+key).click();await selected(key);}
 assert.equal(reads,initialReads,'tab changes share the loaded snapshot');
 await page.clock.fastForward(120000);assert.equal(reads,initialReads,'no timer-driven API polling');
 await page.locator('#ops-tab-overview').click();
 const manual=page.locator('#operations-issues a[href="#manual-title"][data-panel-target="collection"]');
 assert.equal(await manual.count(),1,'summary issue links point at the relevant panel');
 await manual.click();await selected('collection');
 assert.equal(await page.evaluate(()=>document.activeElement.id),'manual-title','issue navigation focuses its heading');
 assert.equal(reads,initialReads);
 await refresh();await selected('collection');
 for(const hash of ['growth','growth-title']){
  await page.goto('http://127.0.0.1:4198/admin/operations#'+hash);await page.reload();await settled();await selected('growth');
 }
 await page.locator('#ops-tab-alerts').click();await page.reload();await settled();await selected('alerts');
 // A successful HTTP response can still contain unavailable sections.
 for(const partial of ['history','alerts','both']){
  mode=partial;await refresh();await selected('alerts');
  const error=page.locator('#operations-error');
  assert.equal(await error.getAttribute('role'),'alert');assert.equal(await error.isVisible(),true);
  if(partial!=='alerts')assert.match(await error.innerText(),/자료 증가|추이/);
  if(partial!=='history')assert.match(await error.innerText(),/알림/);
  assert.equal(await page.locator('#operations-content').getAttribute('data-partial'),'true');
  assert.equal(await page.locator('#operations-status').getAttribute('role'),'status');
  assert.notEqual((await page.locator('#operations-status').innerText()).trim(),'현황을 확인했어요.','partial result must not claim full success');
  await page.locator('#ops-tab-overview').click();assert.match(await page.locator('#total-values').innerText(),/직접 등록 자료\s*1건/);
  await page.locator('#ops-tab-alerts').click();
  mode='normal';await refresh();await selected('alerts');
  assert.equal((await error.innerText()).trim(),'');
  assert.equal(await page.locator('#operations-content').getAttribute('data-partial'),'false');
 }
 const previous=await page.locator('#manual-values').textContent();
 mode='error';await refresh();await selected('alerts');
 assert.equal(await page.locator('#operations-content').getAttribute('data-stale'),'true');
 assert.equal(await page.locator('#manual-values').textContent(),previous,'503 retains prior snapshot');
 assert.match(await page.locator('#operations-error').innerText(),/이전에 확인한 기록/);
 mode='normal';await refresh();assert.equal(await page.locator('#operations-content').getAttribute('data-stale'),'false');
 // All panels fit narrow pages; summary remains substantially shorter than the old ~2100px page.
 for(const width of [320,390,768,1280]){
  await page.setViewportSize({width,height:844});
  for(const key of keys){
   await page.locator('#ops-tab-'+key).click();await selected(key);
   for(const link of await page.locator('a:not(.wordmark):not(.skip):visible').all()){
    assert.ok(await link.getAttribute('aria-label'),'navigation icon has an accessible name');
    assert.equal(await link.locator('svg[aria-hidden="true"]').count(),1);
    const box=await link.boundingBox();assert.ok(box.width>=44&&box.height>=44,'44px navigation target');
    await link.focus();await page.keyboard.press('Shift+Tab');await page.keyboard.press('Tab');
    const tip=link.locator('.icon-tooltip');assert.equal(await tip.evaluate(el=>getComputedStyle(el).opacity),'1');
    const bounds=await tip.boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width,`tooltip fits ${width}px`);
   }
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${key} overflows at ${width}px`);
  }
 }
 mkdirSync('.local',{recursive:true});await page.locator('#ops-tab-overview').click();
 await page.setViewportSize({width:390,height:844});
 const summaryHeight=await page.evaluate(()=>document.documentElement.scrollHeight);
 assert.ok(summaryHeight<1100,`mobile summary height ${summaryHeight}px must stay below 1100px`);
 await page.screenshot({path:'.local/operations-tabs-mobile.png',fullPage:true});
 await page.locator('#ops-tab-collection').click();await page.screenshot({path:'.local/operations-collection-mobile.png',fullPage:true});
 await page.locator('#ops-tab-overview').click();
 await page.setViewportSize({width:1280,height:960});await page.screenshot({path:'.local/operations-tabs-desktop.png',fullPage:true});
 mode='auth';await refresh();await page.locator('#operations-login').waitFor({state:'visible'});
 assert.equal(await page.locator('#operations-content').innerHTML(),'','authentication loss clears every cached panel');
 assert.equal(await page.getByRole('link',{name:'관리자 로그인',exact:true}).locator('svg').count(),1);
 assert.equal(writes,0);assert.deepEqual(errors,[]);
 console.log(`PASS: operations tabs, keyboard, hash, issue focus, single snapshot, partial/recovery/stale/auth, four widths, summary ${summaryHeight}px, zero writes/errors`);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));sqlite.close();}
