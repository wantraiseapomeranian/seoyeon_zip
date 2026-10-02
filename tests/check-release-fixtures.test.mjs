import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {test} from 'node:test';
import {pathToFileURL} from 'node:url';

const guard=pathToFileURL(resolve('scripts/check-release-fixtures.mjs')).href;
const run=(code,browser=false)=>spawnSync(process.execPath,['--import',guard,'--input-type=module','-e',code],{encoding:'utf8',env:{...process.env,RELEASE_BROWSER_FIXTURES:browser?'1':'0'},timeout:30000,windowsHide:true});

test('fixture preload denies remote Node fetch before network dispatch',()=>{
 const child=run("import assert from 'node:assert/strict';await assert.rejects(fetch('https://unmatched.example.test/blocked-fixture'),/Release checks deny external fetch/);console.log('blocked-before-dispatch')");
 assert.equal(child.status,1,'unexpected external request fails the check even if caught');
 assert.match(child.stdout,/blocked-before-dispatch/);
});

test('fixture preload permits real loopback Node fetch',()=>{
 const child=run("import {createServer} from 'node:http';import assert from 'node:assert/strict';const server=createServer((q,r)=>r.end('fixture'));await new Promise(r=>server.listen(0,'127.0.0.1',r));try{assert.equal(await (await fetch('http://127.0.0.1:'+server.address().port)).text(),'fixture');console.log('loopback-ok')}finally{server.closeAllConnections();server.close()}");
 assert.equal(child.status,0,child.stderr);
 assert.match(child.stdout,/loopback-ok/);
});

test('browser guard permits loopback and explicit fixtures, denies unmatched external requests',()=>{
 const child=run(`import assert from 'node:assert/strict';import {createServer} from 'node:http';import {chromium} from 'playwright';
 const server=createServer((q,r)=>r.end('loopback'));await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{for(const contextPage of [true,false]){
  const page=contextPage?await (await browser.newContext()).newPage():await browser.newPage();
  await page.goto('http://127.0.0.1:'+server.address().port);assert.equal(await page.locator('body').textContent(),'loopback');
  await page.route('https://fixture.example.test/**',r=>r.fulfill({body:'routed-fixture'}));
  await page.goto('https://fixture.example.test/');assert.equal(await page.locator('body').textContent(),'routed-fixture');
  await page.route('**/*',r=>r.continue());
  await assert.rejects(page.goto('https://unmatched.example.test/blocked-fixture'),/ERR_FAILED/);await page.close();
 }console.log('browser-fixture-ok')}finally{await browser.close();server.closeAllConnections();server.close()}`,true);
 assert.equal(child.status,1,child.stderr);
 assert.match(child.stdout,/browser-fixture-ok/);
 assert.match(child.stderr,/Release checks deny external browser request/);
});

test('browser guard stops a loopback redirect before dispatching its external target',()=>{
 const child=run(`import assert from 'node:assert/strict';import {createServer} from 'node:http';import {chromium} from 'playwright';
 let externalReads=0;
 const server=createServer((q,r)=>{if(q.url==='/redirect'){r.writeHead(302,{location:'http://redirected.example.test:'+server.address().port+'/target'});r.end()}else{externalReads++;r.end('external target reached')}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--host-resolver-rules=MAP redirected.example.test 127.0.0.1','--no-proxy-server']});
 try{const page=await browser.newPage();await assert.rejects(page.goto('http://127.0.0.1:'+server.address().port+'/redirect'),/ERR_FAILED/);assert.equal(externalReads,0);console.log('browser-redirect-blocked')}finally{await browser.close();server.closeAllConnections();server.close()}`,true);
 assert.equal(child.status,1,child.stderr);
 assert.match(child.stdout,/browser-redirect-blocked/);
});
