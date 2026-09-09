async page => {
 await page.goto('http://127.0.0.1:4174/feed.html');
 await page.waitForSelector('.card');
 const checks=[];
 for(const variant of ['a']){
  for(const width of [1440,768,390,360]){
   await page.setViewportSize({width,height:1000});
   await page.locator('.card img').first().waitFor();
   await page.waitForFunction(()=>[...document.querySelectorAll('.card')].slice(0,2).every(c=>c.dataset.preview));
   const state=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,columns:getComputedStyle(document.querySelector('.gallery')).gridTemplateColumns.split(' ').length,dates:[...document.querySelectorAll('.card')].map(c=>Date.parse(c.dataset.date)),cards:document.querySelectorAll('.card').length}));
   if(state.overflow||state.dates.some((d,i)=>i&&d>state.dates[i-1]))throw Error('Overflow/order '+JSON.stringify({width,variant,state}));
   if([1440,390].includes(width))await page.screenshot({path:`.local/feed-clean-${variant}-${width}.png`,fullPage:false});
   checks.push({variant,width,columns:state.columns,cards:state.cards});
  }
 }
 await page.locator('[data-media=video]').click();
 if(!await page.locator('.card').count()||!(await page.url()).includes('media=video'))throw Error('Video filter');
 await page.reload();await page.waitForSelector('.card');
 if(await page.locator('[data-media=video]').getAttribute('aria-pressed')!=='true')throw Error('URL state');
 await page.locator('#kind').selectOption('official');
 if(!await page.locator('#empty').isVisible())throw Error('Empty filter');
 await page.locator('#reset').click();
 await page.locator('#source').selectOption('Seowoo_0501');
 const sourceRows=await page.evaluate(()=>[...document.querySelectorAll('.card')].map(c=>({author:c.querySelector('.author').textContent,via:c.querySelector('.via')?.textContent})));
 if(!sourceRows.length||!sourceRows.every(r=>r.via?r.via.includes('Seowoo_0501'):r.author==='@Seowoo_0501'))throw Error('Source filter');
 if(sourceRows.some(r=>r.author==='@Seowoo_0501'&&r.via))throw Error('Duplicate source');
 await page.locator('#source').selectOption('all');
 await page.locator('#open-status').click();
 if(!await page.locator('dialog').isVisible())throw Error('Status dialog');
 await page.keyboard.press('Escape');
 if(await page.locator('dialog').isVisible()||await page.evaluate(()=>document.activeElement.id)!=='open-status')throw Error('Dialog focus');
 const count=await page.locator('.card').count();
 await page.route('**/api/samples',route=>route.fulfill({status:503,body:'unavailable'}));
 await page.locator('#refresh').click();await page.waitForFunction(()=>!document.querySelector('#refresh').disabled);
 if(await page.locator('.card').count()!==count||!(await page.locator('#notice').textContent()).includes('못했'))throw Error('Refresh preservation');
 await page.unroute('**/api/samples');
 await page.locator('.preview img').first().evaluate(img=>img.src='/missing-preview.jpg');
 await page.waitForSelector('.card[data-preview=failed] .fallback');
 const original=await page.locator('.card[data-preview=failed] a').getAttribute('href');if(!original.startsWith('https://x.com/'))throw Error('Fallback link');
 await page.locator('.card[data-preview=failed] a').focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');if(!await page.evaluate(()=>document.activeElement.matches('a:focus-visible')))throw Error('Link focus');
 await page.locator('#refresh').click();await page.waitForFunction(()=>!document.querySelector('#refresh').disabled);
 await page.setViewportSize({width:1440,height:1000});
 const cleanup=await page.evaluate(()=>({comparison:!!document.querySelector('.comparison'),imageTop:document.querySelector('.preview').getBoundingClientRect().top,updatedTop:document.querySelector('#updated').getBoundingClientRect().top,caption:document.querySelector('.caption')?.textContent}));
 if(cleanup.comparison||cleanup.updatedTop>=cleanup.imageTop||/#(?:tripleS|윤서연|SeoYeon|서연)(?:\s|$)/iu.test(cleanup.caption))throw Error('Cleanup regression');
 return {checks,cleanup,filters:true,urlState:true,errorPreservesFeed:true,previewFallback:true,dialogFocus:true};
}
