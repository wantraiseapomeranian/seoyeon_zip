import {createServer} from 'node:http';
import {readFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {testDatabase} from '../tests/helpers/d1.mjs';
import {readFeed} from '../src/feed.mjs';
const {DB,sqlite}=testDatabase();
for(let n=0;n<53;n++){
 const format=n<3?'shorts':'regular',id=String(n).padStart(11,'0');
 sqlite.prepare("INSERT INTO youtube_videos(video_id,metadata_json,metadata_fetched_at,decision,category,format) VALUES(?,?,unixepoch(),'kept','appearance',?)").run(id,JSON.stringify({title:(format==='shorts'?'짧게 보는 무대':'무대 전체 영상')+' '+n,channelTitle:'검증용 채널',publishedAt:'2026-09-20T00:00:00.000Z',durationSeconds:format==='shorts'?200:30,thumbnailUrl:'https://i.ytimg.com/fixture.jpg'}),format);
}
let failShorts=false,delayShorts=false;
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://local');
 if(url.pathname==='/api/feed'){
  if(url.searchParams.get('youtubeFormat')==='shorts'){
   if(delayShorts)await new Promise(r=>setTimeout(r,250));
   if(failShorts){res.writeHead(503).end();return;}
  }
  try{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(await readFeed(DB,url.searchParams)));}catch(e){res.writeHead(e.status??500).end();}return;
 }
 if(url.pathname.startsWith('/api/')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(url.pathname==='/api/session'?{role:'visitor'}:{sources:[]}));return;}
 const file=url.pathname.slice(1)||'feed.html';
 if(!/^[\w-]+\.(html|css|js)$/.test(file)){res.writeHead(404).end();return;}
 try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(readFileSync('validation/'+file));}catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({channel:'chrome',headless:true});
mkdirSync('.local/youtube-format',{recursive:true});
try{for(const width of [390,1280]){
 const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://i.ytimg.com/**',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#bcdde9"/></svg>'}));
 const count=async n=>{await page.waitForFunction(n=>document.querySelector('#count').textContent===n+'개 게시물'&&document.querySelector('#gallery').getAttribute('aria-busy')==='false',n);};
 const format=name=>page.getByRole('group',{name:'유튜브 영상 형식',exact:true}).getByRole('button',{name,exact:true});
 await page.goto('http://127.0.0.1:'+server.address().port+'/?data=live');await count(0);
 assert.equal(await page.locator('#youtube-formats').isVisible(),false);
 await page.getByRole('button',{name:'유튜브',exact:true}).click();await count(53);
 assert.equal(await page.locator('#youtube-formats').isVisible(),true,'YouTube shows format controls');
 assert.equal(await format('전체').getAttribute('aria-pressed'),'true');
 await format('쇼츠').click();await count(3);assert.equal(await page.locator('.card').count(),3);assert.ok(new URL(page.url()).searchParams.get('youtubeFormat')==='shorts');
 assert.equal(await page.locator('#load-more').isVisible(),false);
 assert.equal(await page.locator('#aux-filters').isVisible(),false);
 await page.screenshot({path:'.local/youtube-format/'+width+'.png',fullPage:true});
 await page.reload();await count(3);assert.equal(await format('쇼츠').getAttribute('aria-pressed'),'true');
 await format('일반 영상').focus();
 await format('일반 영상').press('Enter');await count(50);assert.equal(await page.locator('.card').count(),48);
 await page.getByRole('button',{name:'더 보기',exact:true}).click();await count(50);assert.equal(await page.locator('.card').count(),50);
 assert.equal(await page.locator('#load-more').isVisible(),false);
 await page.getByRole('button',{name:'사진',exact:true}).click();await count(0);
 assert.equal(await page.locator('#youtube-formats').isVisible(),false);assert.equal(new URL(page.url()).searchParams.has('youtubeFormat'),false);
 await page.getByRole('button',{name:'유튜브',exact:true}).click();await count(50);
 delayShorts=true;await format('쇼츠').click();await format('일반 영상').click();await count(50);await page.waitForTimeout(350);await count(50);delayShorts=false;
 failShorts=true;await format('쇼츠').click();await page.getByText('목록 조회 실패',{exact:true}).waitFor();assert.equal(await format('쇼츠').getAttribute('aria-pressed'),'true');
 failShorts=false;await page.getByRole('button',{name:'목록 새로고침',exact:true}).click();await count(3);
 await page.getByRole('button',{name:/게시일 선택/}).click();await page.getByLabel('게시일 (한국시간)',{exact:true}).fill('2026-09-21');await count(0);
 assert.equal(await page.locator('#empty').isVisible(),true);
 await page.getByRole('button',{name:'필터 초기화',exact:true}).click();await count(53);
 assert.equal(await page.getByRole('button',{name:'유튜브',exact:true}).getAttribute('aria-pressed'),'true');assert.equal(await format('전체').getAttribute('aria-pressed'),'true');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.deepEqual(errors,[]);console.log('PASS '+width+': actual SQL, format counts, paging, reload, tab scope, stale response, retry and reset');await page.close();
}}finally{await browser.close();server.closeAllConnections();server.close();sqlite.close();}
