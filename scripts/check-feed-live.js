async page => {
 const sample=await (await page.request.get('http://127.0.0.1:4174/api/samples',{headers:{referer:'http://127.0.0.1:4174/feed.html'}})).json();
 const base=sample.posts[0];let fail=false;await page.unroute('**/api/feed?*');
 await page.route('**/api/feed?*',async route=>{
  const q=await page.evaluate(url=>Object.fromEntries(new URL(url).searchParams),route.request().url());
  if(fail){fail=false;await route.fulfill({status:500,body:'{}'});return;}
  const offset=Boolean(q.cursor)?48:0;
  const list=Array.from({length:offset?12:48},(_,i)=>({...base,id:String(1000+offset+i),publishedAt:'2026-09-01T00:00:00.000Z'}));
  if(q.month){await page.waitForTimeout(250);list.length=0;}
  await route.fulfill({json:{posts:list,total:q.month?0:60,collectedAt:sample.collectedAt,nextCursor:offset?null:'second'}});
 });
 await page.goto('http://127.0.0.1:4174/feed.html?data=live');
 await page.waitForFunction(()=>document.querySelectorAll('.card').length===48);
 await page.locator('#load-more').click();await page.waitForFunction(()=>document.querySelectorAll('.card').length===60);
 if(await page.locator('#load-more').isVisible())throw Error('more after end');
 await page.locator('#refresh').click();await page.waitForFunction(()=>document.querySelectorAll('.card').length===48);
 fail=true;await page.locator('#load-more').click();await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('못했'));
 if(await page.locator('.card').count()!==48)throw Error('lost page');
 await page.locator('#load-more').click();await page.waitForFunction(()=>document.querySelectorAll('.card').length===60);
 await page.waitForFunction(()=>!document.querySelector('#refresh').disabled);await page.locator('#month-trigger').click();await page.locator('#month').fill('2025-01');await page.locator('#clear-month').click();
 await page.waitForFunction(()=>document.querySelectorAll('.card').length===48);await page.waitForTimeout(400);
 if(await page.locator('.card').count()!==48)throw Error('stale response');
 const widths=[];for(const width of [390,1440]){await page.setViewportSize({width,height:900});if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('overflow '+width);widths.push(width);}
 await page.setViewportSize({width:390,height:900});await page.screenshot({path:'.local/feed-live-390.png'});
 await page.unroute('**/api/feed?*');await page.goto('http://127.0.0.1:4174/feed.html');
 return {pagination:60,retry:true,staleResponseIgnored:true,widths,mode:'mock API browser, SQL verified separately'};
}
