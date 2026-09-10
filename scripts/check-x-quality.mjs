import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {testDatabase} from '../tests/helpers/d1.mjs';
import {handleApi} from '../src/worker.mjs';
import {readFeed} from '../src/feed.mjs';
const {sqlite,DB}=testDatabase();
const b=readFileSync('.local/x-quality-posts.json');const posts=JSON.parse((b[0]===255?b.toString('utf16le'):b.toString('utf8')).replace(/^\uFEFF/,''))[0].results;
for(const p of posts)sqlite.prepare('INSERT INTO posts VALUES(?,?)').run(p.id,p.data);
sqlite.exec(readFileSync('.local/x-quality-backfill.sql','utf8'));
const ids=['x:2095157094840438890','x:2095168227504443686','x:2095162481274491262','x:2095157556041724097'];
assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM x_feed_posts WHERE id IN (?,?,?,?)').get(...ids).n,1);
for(const id of ['x:2097565665976586317','x:2097654716473692369','x:2097188180164538847','x:2097716671142371532'])assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM x_feed_posts WHERE id=?').get(id).n,0);
assert.ok((await readFeed(DB,new URLSearchParams())).total<posts.length);
const server=createServer(async(req,res)=>{try{
 if(req.headers.host!=='127.0.0.1:4179'){res.writeHead(403).end();return;}
 const path=new URL(req.url,'http://127.0.0.1:4179').pathname;
 if(path.startsWith('/api/')){const chunks=[];for await(const c of req)chunks.push(c);const r=await handleApi(new Request('http://127.0.0.1:4179'+req.url,{method:req.method,headers:req.headers,...(req.method==='POST'?{body:Buffer.concat(chunks)}:{})}),{DB});res.writeHead(r.status,{'Content-Type':'application/json'});res.end(await r.text());return;}
 const file=path==='/admin/x'?'x-review.html':path.slice(1);if(!['x-review.html','x-review.js','instagram.css','feed.css'].includes(file)){res.writeHead(404).end();return;}
 res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html'});res.end(readFileSync('validation/'+file));
 }catch(e){res.writeHead(500).end(e.message);}});
await new Promise(r=>server.listen(4179,'127.0.0.1',r));let browser;
try{browser=await chromium.launch({headless:true,channel:'chrome'});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:4179/admin/x');await page.waitForSelector('.review-card');
for(const width of [1440,390]){await page.setViewportSize({width,height:950});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:`.local/x-review-${width}.png`});}
await page.getByRole('button',{name:'숨기기',exact:true}).first().click();await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('저장'));assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM x_quality WHERE decision='hidden'").get().n,1);assert.deepEqual(errors,[]);console.log('PASS: supplied 4 duplicate posts => 1, 3 unwanted examples hidden, missing example hidden, UI save and 1440/390px.');
}finally{await browser?.close();server.close();sqlite.close();}
