import {createServer} from 'node:http';
import {readFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {testDatabase} from '../tests/helpers/d1.mjs';
import {handleApi} from '../src/worker.mjs';

const {DB,sqlite,enable}=testDatabase();enable();
sqlite.exec("UPDATE collection_state SET last_success_at=unixepoch()-180,last_attempt_at=unixepoch()-60,next_due_at=unixepoch()+180 WHERE enabled=1");
const env={DB,COLLECTION_ENABLED:'true',APIFY_SYNC_ENABLED:'true',APIFY_TASK_ID:'testTask',APIFY_TOKEN:'local-test-only',MANUAL_MEDIA_ENABLED:'true'};
sqlite.exec("INSERT INTO instagram_sync(id,task_id,last_checked_at,last_success_at,next_due_at) VALUES(1,'testTask',datetime('now'),datetime('now','-1 day'),unixepoch()+300)");
sqlite.prepare('INSERT INTO manual_posts VALUES(?,?,?,?)').run('manual:x:123','https://x.com/sample/status/123','{}',new Date().toISOString());
sqlite.exec("INSERT INTO manual_media_jobs(post_id,state,error) VALUES('manual:x:123','failed','provider_network')");
let mode='normal',reads=0,writes=0,role='owner',release;
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1:4197');if(req.headers.host!=='127.0.0.1:4197'){res.writeHead(403).end();return;}
 if(req.method!=='GET')writes++;
 if(url.pathname==='/api/admin/operations'){reads++;if(mode==='delay')await new Promise(r=>{release=r;});if(mode==='error'||mode==='auth'){res.writeHead(mode==='auth'?401:503,{'Content-Type':'application/json'}).end('{}');return;}}
 if(url.pathname==='/api/session'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({role}));return;}
 if(url.pathname==='/api/feed'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({posts:[],total:0,nextCursor:null}));return;}
 if(url.pathname.startsWith('/api/')){const response=await handleApi(new Request(url,{method:req.method}),env);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;}
 const file=url.pathname==='/admin/operations'?'operations.html':url.pathname==='/'?'feed.html':url.pathname.slice(1);
 if(!['operations.html','operations.css','operations.js','feed.html','feed.js','feed.css','review-gallery.js'].includes(file)){res.writeHead(404).end();return;}
 res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(readFileSync('validation/'+file));
 }catch(error){res.writeHead(500).end(error.message);}});
await new Promise(r=>server.listen(4197,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,channel:'chrome'});const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://127.0.0.1:4197/admin/operations');await page.locator('#operations-content').waitFor({state:'visible'});
 assert.match(await page.locator('#growth-status').innerText(),/첫 기록/);assert.equal(await page.locator('#growth-details').isVisible(),false);
 const today=new Date(Date.now()+9*3600000).toISOString().slice(0,10);
 for(const [offset,x,size,sql,status] of [[0,3200,12000000,28.45,'ok'],[1,3000,11000000,32,'ok'],[3,2500,null,null,'failed']]){
  const day=new Date(Date.parse(today+'T00:00:00Z')-offset*86400000).toISOString().slice(0,10);
  sqlite.prepare("INSERT INTO operations_history VALUES(?,?,?,?,?,?,?,?,?,?,?)").run(day,day+'T01:00:00Z',x,170,1,size,'x-review-v1',status,sql,status==='ok'?52000:null,status==='ok'?46000:null);
 }
 await page.locator('#operations-refresh').click();await page.waitForFunction(()=>document.querySelector('#growth-values').textContent.includes('+200건'));
 assert.match(await page.locator('#growth-values').innerText(),/전일 대비 \+1 MB/);assert.match(await page.locator('#growth-query').innerText(),/28.45 ms/);
 assert.equal(await page.locator('#growth-rows').isVisible(),false);await page.locator('#growth-details summary').click();assert.equal(await page.locator('#growth-rows tr').count(),3);assert.match(await page.locator('#growth-rows').innerText(),/측정 실패/);assert.doesNotMatch(await page.locator('#growth-rows tr').last().innerText(),/0 ms/);
 for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 await page.setViewportSize({width:390,height:844});mkdirSync('.local',{recursive:true});await page.locator('[aria-labelledby="growth-title"]').screenshot({path:'.local/operations-growth-mobile.png'});
 await page.setViewportSize({width:1280,height:960});await page.locator('[aria-labelledby="growth-title"]').screenshot({path:'.local/operations-growth-desktop.png'});
 // Missing yesterday must not become a multi-day change labelled as a daily change.
 sqlite.prepare('DELETE FROM operations_history WHERE day!=?').run(today);
 await page.locator('#operations-refresh').click();await page.waitForFunction(()=>document.querySelector('#growth-values').textContent.includes('전일 비교 없음'));
 sqlite.exec('DROP TABLE operations_history');await page.locator('#operations-refresh').click();await page.waitForFunction(()=>document.querySelector('#growth-status').textContent.includes('불러오지 못했어요'));
 assert.equal(await page.locator('#total-values').isVisible(),true);
 assert.match(await page.locator('#operations-issues').innerText(),/사진 조회 실패 1건/);assert.match(await page.locator('#instagram-values').innerText(),/외부 실행 확인/);assert.match(await page.locator('#total-values').innerText(),/직접 등록 자료\n1건/);
 assert.equal(await page.locator('#x-sources').isVisible(),false);await page.locator('#x-details-title').click();assert.equal(await page.locator('#x-sources').isVisible(),true);await page.locator('#x-details-title').click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);mkdirSync('.local',{recursive:true});await page.screenshot({path:'.local/operations-mobile.png',fullPage:true});await page.screenshot({path:'.local/operations-mobile-top.png'});
 await page.setViewportSize({width:1280,height:960});await page.screenshot({path:'.local/operations-desktop.png',fullPage:true});
 mode='delay';const before=reads;await page.locator('#operations-refresh').click();await page.waitForFunction(()=>document.querySelector('#operations-refresh').getAttribute('aria-disabled')==='true');await page.locator('#operations-refresh').click({force:true});assert.equal(reads,before+1);mode='normal';release();await page.getByRole('status').filter({hasText:'현황을 확인했어요.'}).waitFor();
 mode='error';await page.locator('#operations-refresh').click();await page.getByRole('alert').filter({hasText:'이전에 확인한 기록'}).waitFor();assert.equal(await page.locator('#operations-content').isVisible(),true);assert.equal(await page.locator('#operations-content').getAttribute('data-stale'),'true');
 mode='normal';await page.locator('#operations-refresh').click();await page.waitForFunction(()=>document.querySelector('#operations-content').dataset.stale==='false');
 for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 await page.getByRole('link',{name:'자료 관리 열기',exact:true}).click();await page.locator('#source-dialog[open]').waitFor();assert.equal(await page.locator('#tools-panel').isVisible(),true);await page.getByRole('link',{name:'운영 현황 보기'}).click();await page.locator('#operations-content').waitFor({state:'visible'});
 await page.getByRole('link',{name:'수집 관리 열기'}).click();await page.locator('#source-dialog[open]').waitFor();assert.equal(await page.locator('#collection-panel').isVisible(),true);
 await page.goto('http://127.0.0.1:4197/admin/operations');await page.locator('#operations-content').waitFor({state:'visible'});mode='auth';await page.locator('#operations-refresh').click();await page.locator('#operations-login').waitFor({state:'visible'});assert.equal(await page.locator('#operations-content').innerHTML(),'');
 mode='error';await page.reload();await page.waitForFunction(()=>document.querySelector('#operations-error').textContent.length>0);assert.equal(await page.locator('#operations-content').isVisible(),false);
 role='visitor';mode='normal';await page.goto('http://127.0.0.1:4197/?manage=tools');await page.locator('#open-status').click();assert.equal(await page.getByRole('link',{name:'운영 현황 보기'}).isVisible(),false);assert.equal(await page.locator('#tools-panel').isVisible(),false);
 assert.equal(writes,0);assert.deepEqual(errors,[]);console.log('PASS: operations real API, counts, mobile layouts, repeat-click guard, stale/error/auth, management navigation, visitor hiding, zero writes');
}finally{release?.();await browser?.close();await new Promise(r=>server.close(r));sqlite.close();}
