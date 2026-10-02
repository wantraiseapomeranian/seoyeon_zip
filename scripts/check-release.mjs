import {spawn, spawnSync} from 'node:child_process';
import {readdirSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const guard=pathToFileURL(resolve(root,'scripts/check-release-fixtures.mjs')).href;

// Pass only OS/browser necessities. Provider credentials and NODE_OPTIONS stay out.
export function releaseEnvironment(env=process.env) {
 const allowed=/^(path|pathext|systemroot|windir|comspec|temp|tmp|tmpdir|home|userprofile|localappdata|appdata|programfiles|programfiles\(x86\)|programw6432|lang|lc_all|display|xdg_runtime_dir|xdg_cache_home|ci)$/i;
 return Object.fromEntries(Object.entries(env).filter(([name])=>allowed.test(name)));
}

function killTree(child) {
 if(!child.pid)return;
 if(process.platform==='win32') {
  spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});
 } else {
  try {process.kill(-child.pid,'SIGKILL');} catch(error) {if(error.code!=='ESRCH')throw error;}
 }
}

export async function runChecks(checks,{cwd=root,env=releaseEnvironment(),timeoutMs=180000,stdio='inherit'}={}) {
 for(const check of checks) {
  console.log('RUN: '+check.name);
  const exitCode=await new Promise(resolveResult=>{
   let settled=false;
   const child=spawn(check.command,check.args,{cwd,env:{...env,...check.env},stdio,windowsHide:true,detached:process.platform!=='win32'});
   const finish=code=>{if(settled)return;settled=true;clearTimeout(timer);process.off('SIGINT',interrupt);process.off('SIGTERM',interrupt);resolveResult(code);};
   const interrupt=()=>{killTree(child);finish(1);};
   const timer=setTimeout(()=>{console.error('FAIL: '+check.name+' timed out');killTree(child);finish(1);},timeoutMs);
   process.once('SIGINT',interrupt);process.once('SIGTERM',interrupt);
   child.once('error',error=>{console.error('FAIL: '+check.name+' could not start ('+error.code+')');finish(1);});
   child.once('close',(code,signal)=>{if(signal)console.error('FAIL: '+check.name+' terminated ('+signal+')');finish(code===null?1:code);});
  });
  if(exitCode!==0) {
   console.error('FAIL: '+check.name+'; remaining checks were not run');
   return {exitCode,failedCheck:check.name};
  }
  console.log('PASS: '+check.name);
 }
 return {exitCode:0,failedCheck:null};
}

export function releaseChecks() {
 const node=(name,args,browser=false)=>({name,command:process.execPath,args:['--import',guard,...args],env:browser?{RELEASE_BROWSER_FIXTURES:'1'}:{}});
 const script=(name,path,args=[],browser=false)=>node(name,['scripts/'+path,...args],browser);
 return [
  node('Node tests',['--test',...readdirSync(resolve(root,'tests')).filter(name=>name.endsWith('.test.mjs')).sort().map(name=>'tests/'+name)]),
  script('Runtime: operations','check-operations-runtime.mjs',['--local']),
  script('Runtime: feed batch','validate-feed-batch.mjs',['--local']),
  script('UI: theme','check-theme.mjs',[],true),
  script('UI: forced dark','check-forced-dark.mjs',[],true),
  script('UI: photo touch scroll','check-photo-touch-scroll.mjs',[],true),
  script('UI: photo loading','check-photo-loading.mjs',[],true),
  script('UI: review focus','check-ui-audit-fixes.mjs',[],true),
  script('UI: enlarged text','check-ui-audit-fixes.mjs',['text'],true),
  script('Feed: filters','check-feed-filters.mjs',[],true),
  script('Feed: paging','check-feed-paging.mjs',[],true),
  script('Feed: preload','check-feed-preload.mjs',[],true),
  script('Feed: photo ratio','check-feed-photo-ratio.mjs',[],true),
  script('Photo: viewer','check-photo-viewer.mjs',[],true),
  script('Operations: tabs','check-operations-tabs.mjs',[],true)
 ];
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const version=process.versions.node.split('.').map(Number);
 if(version[0]<24||(version[0]===24&&(version[1]<14||(version[1]===14&&version[2]<1)))) {
  console.error('FAIL: Node.js >=24.14.1 is required');process.exitCode=1;
 } else {
  const result=await runChecks(releaseChecks());
  process.exitCode=result.exitCode;
  if(result.exitCode===0)console.log('PASS: release checks complete');
 }
}
