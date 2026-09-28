import {chromium} from 'playwright';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

const browser=await chromium.launch({headless:true,channel:'chrome'});
const post=i=>({id:'x:'+String(i).padStart(3,'0'),canonicalUrl:`https://x.com/sample/status/${i}`,authorHandle:'sample',observedViaSource:'sample',publishedAt:`2026-09-${String(10-Math.floor((i-1)/32)).padStart(2,"0")}T12:00:00Z`,caption:'서연',media:[1,2].map(n=>({kind:'image',previewUrl:`https://pbs.twimg.com/media/test${i}-${n}.jpg?name=orig`,width:n===1?600:900,height:800}))});
try {
 for(const width of [390,1280]) for(const sort of ['newest','oldest']) {
  const page=await browser.newPage({viewport:{width,height:850}});
  page.setDefaultTimeout(10000);
  const requests=[],errors=[];let failMore=true;
  page.on('pageerror',e=>errors.push(e.message));
  const rows=Array.from({length:96},(_,i)=>post(i+1)).sort((a,b)=>(sort==='oldest'?1:-1)*(Date.parse(a.publishedAt)-Date.parse(b.publishedAt))||a.id.localeCompare(b.id));
  await page.route('**/*',r=>{
   const u=new URL(r.request().url());
   if(u.hostname==='pbs.twimg.com') {requests.push(u.href);return r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="#cce0e9"/></svg>'});}
   if(u.pathname==='/api/feed') {
    const cursor=u.searchParams.get('cursor');
    if(cursor&&failMore)return r.fulfill({status:503,json:{error:'unavailable'}});
    const posts=cursor==='end'?[rows[95]]:cursor?[rows[47],...rows.slice(48)]:rows.slice(0,48);
    return r.fulfill({json:{posts,total:96,nextCursor:cursor==='end'?null:cursor?'end':'next'}});
   }
   if(u.pathname==='/api/session')return r.fulfill({json:{role:'visitor'}});
   if(u.pathname==='/api/collection-status')return r.fulfill({json:{sources:[]}});
   const file=u.pathname==='/'?'feed.html':u.pathname.slice(1);
   try{return r.fulfill({body:readFileSync('validation/'+file),contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html'});}catch{return r.fulfill({status:404,body:''});}
  });
  await page.goto('http://feed.test/?sort='+sort);
  await page.waitForFunction(()=>document.querySelectorAll('.card').length===48);
  const first=page.locator('.card').first();
  const before=await first.boundingBox();
  await first.getByRole('button',{name:'피드 사진 다음',exact:true}).click();
  assert.equal(await first.locator('.photo-count').textContent(),'2 / 2');
  assert.equal((await first.boundingBox()).height,before.height);
  assert.ok(requests.length>0&&requests.every(x=>new URL(x).searchParams.get('name')==='small'));
  await first.getByRole('button',{name:'피드 사진 확대',exact:true}).click();
  await page.waitForSelector('.photo-dialog[open]');
  assert.ok(requests.some(x=>x.includes('test'+Number(rows[0].id.slice(2))+'-2.jpg?name=orig')));
  await page.getByRole('button',{name:'닫기',exact:true}).click();
  const photoBottom=await first.locator('.photo-gallery').evaluate(e=>e.getBoundingClientRect().bottom+scrollY);
  await page.evaluate(y=>scrollTo(0,y),photoBottom+900);
  await page.waitForTimeout(150);
  assert.ok(await first.locator('.photo-frame img').getAttribute('src'),'Nearby image stays loaded after scrolling 900px past it');
  await page.evaluate(y=>scrollTo(0,y),photoBottom+1600);
  await page.waitForFunction(()=>!document.querySelector('.card .photo-frame img').hasAttribute('src'));
  await first.scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>document.querySelector('.card .photo-frame img').naturalWidth>0);

  await page.evaluate(()=>{window.savedCards=[...document.querySelectorAll('#gallery .card')];window.removedGalleryNodes=0;window.galleryObserver=new MutationObserver(records=>{window.removedGalleryNodes+=records.reduce((n,r)=>n+r.removedNodes.length,0);});window.galleryObserver.observe(document.querySelector('#gallery'),{childList:true});});
  await page.locator('#load-more').click();
  await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('목록을 불러오지 못했어요'));
  assert.equal(await page.locator('.card').count(),48);
  assert.equal(await page.evaluate(()=>window.savedCards.every(c=>c.isConnected)),true);
  failMore=false;
  await page.locator('#load-more').focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.querySelectorAll('.card').length===96);
  assert.equal(await page.evaluate(()=>window.savedCards.every((c,i)=>c===document.querySelectorAll('#gallery .card')[i])),true,'Existing cards must retain DOM identity');
  assert.equal(await page.evaluate(()=>window.removedGalleryNodes),0,'Append must not remove existing gallery nodes');
  assert.equal(await page.evaluate(()=>document.activeElement?.dataset.id),rows[48].id);
  assert.deepEqual(await page.locator('.card').evaluateAll(es=>es.map(e=>e.dataset.id)),rows.map(p=>p.id));
  const days=[...new Set(rows.map(p=>p.publishedAt.slice(0,10).replaceAll('-','.')))];
  assert.deepEqual(await page.locator('.day-heading>span:first-child').allTextContents(),days);
  await first.scrollIntoViewIfNeeded();
  assert.equal(await first.locator('.photo-count').textContent(),'2 / 2');
  await page.waitForFunction(()=>document.querySelectorAll('.feed-gallery img[src]').length<30);
  assert.equal(await first.getByRole('link',{name:'원문 보기',exact:true}).getAttribute('href'),rows[0].canonicalUrl);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.locator('#load-more').click();
  await page.waitForFunction(()=>document.querySelector('#load-more').hidden);
  assert.equal(await page.locator('.card').count(),96);
  assert.equal(await page.locator('#empty').isVisible(),false);
  assert.equal(await page.evaluate(()=>window.removedGalleryNodes),0);
  assert.deepEqual(await page.locator('.day-heading>span:first-child').allTextContents(),days);
  await page.getByRole('button',{name:'목록 새로고침',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.card').length===48);
  assert.equal(await page.evaluate(()=>window.savedCards.every(c=>!c.isConnected)),true);
  assert.equal(await first.locator('.photo-count').textContent(),'1 / 2');
  assert.deepEqual(errors,[]);
  await page.close();
  console.log('PASS: '+width+'px '+sort+' append preserves cards, order, day boundaries, photo selection, focus, retries and reset');
 }
}finally{await browser.close();}
