import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {testDatabase} from '../tests/helpers/d1.mjs';
import {handleApi} from '../src/worker.mjs';
import {processManual} from '../src/manual-posts.mjs';
const {DB,sqlite}=testDatabase(),env={DB,MANUAL_MEDIA_ENABLED:'true'};
let fail=false;
const fetcher=async()=>fail?new Response('',{status:503}):Response.json({code:200,tweet:{id:'123',author:{screen_name:'artist'},text:'manual media',created_at:'2026-09-01T00:00:00Z',media:{all:[{type:'photo',url:'https://pbs.twimg.com/media/a.jpg'},{type:'photo',url:'https://pbs.twimg.com/media/b.jpg'}]}}});
const pending=new Set();
const ctx={waitUntil(p){pending.add(p);p.finally(()=>pending.delete(p));}};
const server=createServer(async(req,res)=>{try{
 const origin='http://127.0.0.1:4196',url=new URL(req.url,origin);
 if(req.headers.host!=='127.0.0.1:4196'){res.writeHead(403).end();return;}
 if(url.pathname==='/api/session'){res.setHeader('Content-Type','application/json');res.end('{"role":"owner"}');return;}
 if(url.pathname.startsWith('/api/')){const chunks=[];for await(const c of req)chunks.push(c);
 const response=await handleApi(new Request(url,{method:req.method,headers:req.headers,...(req.method==='POST'?{body:Buffer.concat(chunks)}:{})}),env);
 if(req.method==='POST'&&url.pathname==='/api/manual-posts')ctx.waitUntil(processManual(env,{fetcher}));
 res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;}
 const file=url.pathname.slice(1)||'feed.html';if(!['feed.html','feed.js','feed.css','review-gallery.js'].includes(file)){res.writeHead(404).end();return;}
 res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(readFileSync('validation/'+file));
 }catch(error){res.writeHead(500).end(error.message);}});
await new Promise(r=>server.listen(4196,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,channel:'chrome'});const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(10000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://pbs.twimg.com/**',route=>route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=','base64')}));
 await page.goto('http://127.0.0.1:4196/feed.html?data=live');await page.locator('#open-status').click();await page.getByRole('tab',{name:'자료 관리',exact:true}).click();
 await page.locator('#manual-url').fill('https://x.com/artist/status/123');await page.locator('#manual-submit').click();
 await page.locator('#manual-list').getByText('사진을 불러왔어요.',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:'.local/manual-media-mobile.png'});
 await page.locator('#close-status').click();await page.locator('.feed-gallery img').first().waitFor();assert.equal(await page.locator('.manual-preview').count(),0);assert.equal(await page.locator('.photo-count').textContent(),'1 / 2');
 await page.locator('.photo-arrow').last().click();assert.equal(await page.locator('.photo-count').textContent(),'2 / 2');
 await page.locator('#open-status').click();await page.getByRole('tab',{name:'자료 관리',exact:true}).click();
 fail=true;sqlite.exec('UPDATE manual_media_jobs SET updated_at=0');await page.locator('#manual-refresh').click();await page.getByRole('button',{name:'사진 새로고침',exact:true}).click();
 await page.locator('#manual-list').getByText('사진을 가져오지 못했어요. 잠시 후 다시 시도해 주세요.',{exact:true}).waitFor();
 assert.equal(JSON.parse(sqlite.prepare('SELECT data FROM manual_posts').get().data).media.length,2);
 await page.setViewportSize({width:1280,height:850});await page.screenshot({path:'.local/manual-media-desktop.png'});assert.deepEqual(errors,[]);
 console.log('PASS: single URL entry, asynchronous status, manual carousel, retry failure preserves media, mobile overflow and browser errors');
}finally{await browser?.close();await Promise.allSettled([...pending]);await new Promise(r=>server.close(r));sqlite.close();}
