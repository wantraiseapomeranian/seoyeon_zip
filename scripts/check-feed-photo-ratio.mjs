import {createServer} from 'node:http';
import {readFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const server=createServer((req,res)=>{const file=new URL(req.url,'http://local').pathname.slice(1)||'feed.html';if(!/^[\w-]+\.(html|css|js)$/.test(file)){res.writeHead(404).end();return;}try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(readFileSync('validation/'+file));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true});
mkdirSync('.local/photo-ratio',{recursive:true});
try{for(const width of [390,1280]){
 const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',async r=>{const url=new URL(r.request().url());
  if(url.pathname==='/api/feed')return r.fulfill({json:{posts:[['landscape','2026-09-27'],['portrait','2026-09-26']].map(([name,date],i)=>({id:'fixture-'+i,platform:'instagram',authorHandle:'fixture',publishedAt:date+'T00:00:00Z',caption:'사진 비율 검증',canonicalUrl:'https://www.instagram.com/p/fixture/',media:(i?['portrait','landscape','landscape']:['landscape','portrait']).map(n=>({kind:'image',previewUrl:'https://images.example.test/'+n+'.svg'}))})),total:2,nextCursor:null,collectedAt:'2026-09-29T00:00:00Z'}});
  return r.fulfill({json:url.pathname==='/api/session'?{role:'visitor'}:{sources:[]}});
 });
 await page.route('https://images.example.test/**',r=>{const portrait=r.request().url().includes('portrait');return r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="'+(portrait?'800':'300')+'"><rect width="600" height="800" fill="#bcdde9"/><rect x="30" y="30" width="540" height="240" fill="#79b7cc"/></svg>'});});
 await page.goto('http://127.0.0.1:'+server.address().port+'/?data=live');
 await page.waitForFunction(()=>document.querySelector('.card img')?.naturalWidth>0);
 const frame=page.locator('.card .photo-frame').first();
 const check=async ratio=>{const box=await frame.boundingBox();assert.ok(Math.abs(box.width/box.height-ratio)<.01,'frame must fit image: '+JSON.stringify(box));assert.equal(await frame.locator('img').evaluate(e=>getComputedStyle(e).objectFit),'contain');};
 await check(2);
 const layout=await page.evaluate(()=>{const cards=[...document.querySelectorAll('.card')].map(e=>e.getBoundingClientRect());return {columns:getComputedStyle(document.querySelector('#gallery')).gridTemplateColumns.split(' ').length,sameLeft:cards[0].left===cards[1].left,separateRows:cards[1].top>cards[0].bottom,overflow:document.documentElement.scrollWidth>innerWidth};});
 assert.equal(layout.columns,width===390?2:3);assert.equal(layout.sameLeft,true);assert.equal(layout.separateRows,true);assert.equal(layout.overflow,false);
 await page.screenshot({path:'.local/photo-ratio/'+width+'.png',fullPage:true});
 await page.locator('.card').first().getByRole('button',{name:'피드 사진 다음',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.card img').naturalHeight===800);await check(2);
 await page.locator('.card').first().getByRole('button',{name:'피드 사진 이전',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.card img').naturalHeight===300);await check(2);
 // Both directions retain the first photo's frame, controls and metadata positions.
 for(const [index,ratio] of [[0,2],[1,.75]]){
  const post=page.locator('.card').nth(index);await post.scrollIntoViewIfNeeded();
  await post.locator('img').evaluate(img=>img.decode());
  const geometry=()=>post.evaluate(el=>{const top=el.getBoundingClientRect().top;return [...el.querySelectorAll('.photo-frame,.photo-arrow,.card-meta,time')].map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y-top,width:r.width,height:r.height};});});
  const before=await geometry();
  for(let n=1;n<(index?3:2);n++){
   await post.getByRole('button',{name:'피드 사진 다음',exact:true}).click();await post.locator('img').evaluate(img=>img.decode());
   assert.deepEqual(await geometry(),before,'photo switch must keep controls and metadata fixed');
   const box=await post.locator('.photo-frame').boundingBox();assert.ok(Math.abs(box.width/box.height-ratio)<.01);
   assert.equal(await post.locator('img').evaluate(e=>getComputedStyle(e).objectFit),'contain');
  }
  await page.screenshot({path:'.local/photo-ratio/fixed-'+index+'-'+width+'.png',fullPage:true});
  for(let n=1;n<(index?3:2);n++){await post.getByRole('button',{name:'피드 사진 이전',exact:true}).click();await post.locator('img').evaluate(img=>img.decode());}
  assert.deepEqual(await geometry(),before,'cached first photo must preserve the same frame');
 }
 await page.evaluate(()=>{const root=document.createElement('div');root.id='private-fixture';const viewer=reviewGallery([{src:'https://images.example.test/landscape.svg',kind:'image'}],{priority:true});root.append(viewer.element);document.body.append(root);});
 await page.waitForFunction(()=>document.querySelector('#private-fixture img').naturalWidth>0);
 assert.equal(await page.locator('#private-fixture .photo-gallery').evaluate(e=>e.style.getPropertyValue('--photo-ratio')),'','inbox viewer must keep its existing sizing');
 await page.evaluate(()=>{for(const post of [{id:'mixed',platform:'instagram',media:[{kind:'image',previewUrl:'https://images.example.test/landscape.svg'},{kind:'video',previewUrl:'https://images.example.test/portrait.svg'}]},{id:'youtube',platform:'youtube',media:[{kind:'image',previewUrl:'https://images.example.test/landscape.svg'}]}])document.body.append(card({...post,caption:'',canonicalUrl:'https://example.test/',publishedAt:'2026-09-27T00:00:00Z',authorHandle:'fixture'},true));});
 await page.waitForFunction(()=>['mixed','youtube'].every(id=>document.querySelector('[data-id=\"'+id+'\"] img').naturalWidth>0));
 for(const [id,ratio] of [['mixed',.75],['youtube',1.7778]]){const box=await page.locator('[data-id=\"'+id+'\"] .photo-frame').boundingBox();assert.ok(Math.abs(box.width/box.height-ratio)<.01,id+' keeps previous frame ratio');}
 assert.deepEqual(errors,[]);console.log('PASS '+width+': fixed first-photo ratio, controls and metadata, cached back navigation, date rows, no overflow, inbox unchanged');await page.close();
}}finally{await browser.close();server.closeAllConnections();server.close();}
