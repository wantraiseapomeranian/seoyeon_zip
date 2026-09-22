import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import worker from '../src/worker.mjs';
import {createHash} from 'node:crypto';
let release;const gate=new Promise(r=>release=r);
const server=createServer(async(req,res)=>{
 const response=await worker.fetch(new Request('https://fixture.test'+req.url),{PUBLIC_FEED_ENABLED:'true',ASSETS:{fetch:async request=>{
  const name=new URL(request.url).pathname.slice(1);if(!/^[\w.-]+\.(html|js|css)$/.test(name))return new Response('',{status:404});
  if(name==='theme.js')await gate;
  try{return new Response(readFileSync('validation/'+name),{headers:{'Content-Type':name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html'}})}catch{return new Response('',{status:404})}
 }}});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true});
try{const page=await browser.newPage({viewport:{width:390,height:844}});await page.addInitScript(()=>localStorage.setItem('seoyeon-theme','dark'));
 const response=await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'commit'});
 const policy=response.headers()['content-security-policy'];assert.ok(!policy.includes("'unsafe-inline'"));
 for(const file of ['feed','x-review','instagram','youtube','review-history','operations']){
  const html=readFileSync('validation/'+file+'.html','utf8');const boot=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];assert.ok(boot,file);
  assert.ok(policy.includes("'sha256-"+createHash('sha256').update(boot).digest('base64')+"'"),file+' bootstrap must match CSP');
  assert.ok(html.includes('<script src="/theme.js" async></script>'));assert.ok(!html.includes('href="/theme.css"'));
 }
 await page.locator('footer').waitFor({state:'visible',timeout:2000});
 assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
 assert.equal(await page.locator('body').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(25, 33, 39)');
 assert.equal(await page.locator('.theme-launch').count(),0,'full theme UI script is still withheld');
 await page.waitForFunction(()=>performance.getEntriesByName('first-contentful-paint').length>0);
 const fcp=await page.evaluate(()=>performance.getEntriesByName('first-contentful-paint')[0].startTime);
 await page.waitForFunction(()=>document.readyState!=='loading');
 assert.ok(await page.locator('#load-more').count(),'feed script runs while theme UI request is pending');
 release();await page.getByRole('button',{name:'화면 설정',exact:true}).waitFor();
 await page.evaluate(()=>{const s=document.createElement('script');s.textContent='window.untrustedInlineRan=true';document.head.append(s)});
 assert.equal(await page.evaluate(()=>window.untrustedInlineRan),undefined,'CSP still blocks arbitrary inline scripts');
 console.log('PASS saved dark paint without theme.js response; exact bootstrap hash allowed, arbitrary inline blocked; FCP',Math.round(fcp));
}finally{release();await browser.close();server.closeAllConnections();server.close()}
