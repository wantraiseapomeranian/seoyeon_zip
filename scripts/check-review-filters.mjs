import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createReviewFixtures} from './fixtures/review.mjs';

// Real UI with local, read-only mock lists. No review decisions or external requests.
const {x,ig}=createReviewFixtures();
const longAuthor='long_author_123';
let authors=[],sequence=0;
const writes=[],assetErrors=[],pageErrors=[];
const assets=new URL('../validation/',import.meta.url);
const server=createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(req.method!=='GET'){writes.push(`${req.method} ${url.pathname}`);res.writeHead(405).end();return;}
  if(url.pathname==='/api/admin/instagram/sync'){
    res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({status:'disabled'}));return;
  }
  if(['/api/admin/x','/api/admin/instagram'].includes(url.pathname)){
    const isX=url.pathname.endsWith('/x'),id=`response-${++sequence}`;
    const item=isX?{...x,id,comparisons:[]}:{...ig,code:id};
    const counts=isX?{pending:50,visible:0,hidden:0,all:50}:{pending:50,kept:0,held:0,excluded:0};
    res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({items:[item],authors,counts,total:50,groupRevision:1}));return;
  }
  const file=({'/admin/x':'x-review.html','/admin/instagram':'instagram.html'})[url.pathname]||url.pathname.slice(1);
  if(!/^[\w-]+\.(html|js|css)$/.test(file)){res.writeHead(404).end();return;}
  try{
    const body=readFileSync(new URL(file,assets));
    res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html'}).end(body);
  }catch{res.writeHead(404).end();}
});

function queryState(url,isX){
  const q=new URL(url).searchParams;
  for(const key of ['status','offset','date','media','author','kind'])assert.ok(q.getAll(key).length<=1,`duplicate ${key}`);
  if(!isX)assert.equal(q.has('kind'),false,'Instagram has no content-kind control');
  return {status:q.get('status')||'pending',offset:Number(q.get('offset')||0),date:q.get('date')||'',media:q.get('media')||'all',author:q.get('author')||'',...(isX?{kind:q.get('kind')||'all'}:{})};
}

async function requestAfter(page,isX,action,expected){
  const path=isX?'/api/admin/x':'/api/admin/instagram';
  const responsePromise=page.waitForResponse(r=>new URL(r.url()).pathname===path&&r.request().method()==='GET');
  await action();
  const response=await responsePromise;
  assert.equal(response.status(),200);
  assert.deepEqual(queryState(response.url(),isX),expected);
  const data=await response.json(),id=isX?data.items[0].id:data.items[0].code;
  // Await the returned list, so a later control action cannot race its refresh.
  await page.waitForFunction(id=>document.querySelector('.review-card')?.dataset.reviewId===id,id);
}

async function assertBounds(page,label){
  const overflow=await page.evaluate(()=>({
    document:document.documentElement.scrollWidth>innerWidth,
    controls:[...document.querySelectorAll('.review-filters input,.review-filters select,.review-filters button')]
      .filter(el=>el.getClientRects().length).filter(el=>{const r=el.getBoundingClientRect();return r.left<0||r.right>innerWidth+.5;}).map(el=>el.id),
  }));
  assert.deepEqual(overflow,{document:false,controls:[]},label);
}

async function selectWidth(page,selector){
  const geometry=await page.locator(selector).evaluate(select=>{
    const style=getComputedStyle(select),sample=document.createElement('span');
    sample.textContent=select.selectedOptions[0].textContent;
    sample.style.cssText='position:fixed;visibility:hidden;white-space:pre;';
    sample.style.font=style.font;sample.style.letterSpacing=style.letterSpacing;
    document.body.append(sample);
    const text=sample.getBoundingClientRect().width;sample.remove();
    return {width:select.getBoundingClientRect().width,text,available:select.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)};
  });
  assert.ok(geometry.available+.5>=geometry.text,`${selector}: selected label fits ${JSON.stringify(geometry)}`);
  return geometry.width;
}

let browser;
try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext();
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.fulfill({status:404,body:''}));
  const page=await context.newPage();page.setDefaultTimeout(5000);
  page.on('pageerror',error=>pageErrors.push(error.message));
  page.on('response',response=>{const url=new URL(response.url());if(url.origin===origin&&/\.(js|css)$/.test(url.pathname)&&response.status()!==200)assetErrors.push(`${response.status()} ${url.pathname}`);});

  for(const width of [320,390,1280])for(const name of ['x','instagram']){
    const isX=name==='x',defaults={status:'pending',offset:0,date:'',media:'all',author:'',...(isX?{kind:'all'}:{})};
    let expected={...defaults};
    authors=['zulu','a',longAuthor,'a','middle'];
    await page.setViewportSize({width,height:900});
    await requestAfter(page,isX,()=>page.goto(origin+'/admin/'+name),expected);
    const more=page.locator('#review-more'),extra=page.locator('#review-extra');
    assert.equal(await more.getAttribute('aria-expanded'),'false');
    assert.equal(await extra.getAttribute('hidden'),'');
    assert.equal(await more.textContent(),'필터');
    await assertBounds(page,`${name} ${width} collapsed`);
    await more.click();assert.equal(await more.getAttribute('aria-expanded'),'true');assert.equal(await extra.isVisible(),true);
    await more.click();assert.equal(await more.getAttribute('aria-expanded'),'false');assert.equal(await extra.isHidden(),true);
    await more.click();
    assert.deepEqual(await page.locator('#review-author option').evaluateAll(options=>options.map(o=>o.value)),['','a',longAuthor,'middle','zulu']);
    const mediaWidth=await selectWidth(page,'#review-media'),kindWidth=isX?await selectWidth(page,'#review-kind'):null;

    async function nextPage(){expected={...expected,offset:25};await requestAfter(page,isX,()=>page.locator('#next').click(),expected);}
    async function change(key,value){expected={...expected,[key]:value,offset:0};await requestAfter(page,isX,()=>key==='date'?page.locator('#review-date').fill(value):page.locator('#review-'+key).selectOption(value),expected);}
    await nextPage();await change('media','unknown');
    assert.ok(await selectWidth(page,'#review-media')>mediaWidth,'longer selected media label grows');
    assert.equal(await more.textContent(),'필터','primary media filter is not counted as an extra filter');
    await nextPage();await change('date','2026-09-10');
    assert.equal(await more.textContent(),'필터','primary date filter is not counted as an extra filter');
    await nextPage();await change('author','a');
    assert.equal(await more.textContent(),'필터 · 1');
    const shortWidth=await selectWidth(page,'#review-author');
    await change('author',longAuthor);
    assert.ok(await selectWidth(page,'#review-author')>shortWidth,'longer account label grows');
    if(isX){
      await nextPage();await change('kind','official');
      assert.equal(await more.textContent(),'필터 · 2');
      assert.ok(await selectWidth(page,'#review-kind')<kindWidth,'shorter selected kind label shrinks');
    }
    await assertBounds(page,`${name} ${width} selected filters`);

    // A refreshed account list must not silently replace the user's selection.
    authors=['zulu','beta','a','beta'];
    await requestAfter(page,isX,()=>page.locator('#refresh').click(),expected);
    assert.equal(await page.locator('#review-author').inputValue(),longAuthor);
    assert.deepEqual(await page.locator('#review-author option').evaluateAll(options=>options.map(o=>o.value)),['','a','beta',longAuthor,'zulu']);
    assert.equal(await more.textContent(),isX?'필터 · 2':'필터 · 1');
    await selectWidth(page,'#review-author');
    await change('author','a');
    assert.ok(Math.abs(await selectWidth(page,'#review-author')-shortWidth)<=1,'account width returns to the short selected label');

    await nextPage();expected={...defaults};
    await requestAfter(page,isX,()=>page.locator('#review-reset').click(),expected);
    for(const key of ['date','media','author',...(isX?['kind']:[])])assert.equal(await page.locator('#review-'+key).inputValue(),defaults[key],`${name} resets ${key}`);
    assert.equal(await more.textContent(),'필터');
    assert.equal(await page.locator(isX?'#prev':'#previous').isDisabled(),true,'reset returns to first page');
    await assertBounds(page,`${name} ${width} reset`);
    console.log(`PASS ${name} ${width}px: query, first-page reset, authors, filter count, disclosure, selected-label width and bounds`);
  }
  assert.deepEqual(writes,[],'only GET requests are allowed');
  assert.deepEqual(assetErrors,[],'all real UI scripts and styles load');
  assert.deepEqual(pageErrors,[],'no browser page errors');
  console.log('PASS: review filter contracts on both screens at 320/390/1280px; local mock GET APIs only.');
}finally{
  await browser?.close();
  if(server.listening){const closed=new Promise(resolve=>server.close(resolve));server.closeAllConnections();await closed;}
}
