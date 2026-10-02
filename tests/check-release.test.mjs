import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, existsSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';

const load = () => import('../scripts/check-release.mjs');
const fixture = () => mkdtempSync(join(tmpdir(), 'release-runner-'));
const command = (name, code) => ({name, command:process.execPath, args:['-e', code]});

test('release stops at a failing child and preserves its nonzero exit status', async () => {
 const dir=fixture();
 try {
  const {runChecks}=await load();
  const checks=[command('first', "require('node:fs').appendFileSync('ran','first\\n')"), command('failure', "require('node:fs').appendFileSync('ran','failure\\n');process.exit(23)"), command('later', "require('node:fs').appendFileSync('ran','later\\n')")];
  const result=await runChecks(checks,{cwd:dir,stdio:'pipe'});
  assert.equal(result.exitCode,23);
  assert.equal(result.failedCheck,'failure');
  assert.equal(readFileSync(join(dir,'ran'),'utf8'),'first\nfailure\n');
 } finally {rmSync(dir,{recursive:true,force:true});}
});

test('release reports a startup error and never starts the next child', async () => {
 const dir=fixture();
 try {
  const {runChecks}=await load();
  const result=await runChecks([{name:'missing',command:join(dir,'missing-executable'),args:[]},command('later',"require('node:fs').writeFileSync('later','ran')")],{cwd:dir,stdio:'pipe'});
  assert.equal(result.exitCode,1);
  assert.equal(result.failedCheck,'missing');
  assert.equal(existsSync(join(dir,'later')),false);
 } finally {rmSync(dir,{recursive:true,force:true});}
});

test('release timeout closes the child process tree and skips later checks', async () => {
 const dir=fixture();
 try {
  const {runChecks}=await load();
  const child="const s=require('node:http').createServer((q,r)=>r.end('alive'));s.listen(0,'127.0.0.1',()=>require('node:fs').writeFileSync('port',String(s.address().port)));setInterval(()=>{},1000)";
  const parent="require('node:child_process').spawn(process.execPath,['-e',"+JSON.stringify(child)+"],{stdio:'ignore'});setInterval(()=>{},1000)";
  const result=await runChecks([command('hang',parent),command('later',"require('node:fs').writeFileSync('later','ran')")],{cwd:dir,stdio:'pipe',timeoutMs:1500});
  assert.equal(result.exitCode,1);
  assert.equal(result.failedCheck,'hang');
  assert.equal(existsSync(join(dir,'later')),false);
  assert.equal(existsSync(join(dir,'port')),true,'grandchild starts before timeout');
  const port=readFileSync(join(dir,'port'),'utf8');
  await assert.rejects(fetch('http://127.0.0.1:'+port));
 } finally {rmSync(dir,{recursive:true,force:true});}
});

test('release passes only after all children succeed in order', async () => {
 const dir=fixture();
 try {
  const {runChecks}=await load();
  const result=await runChecks(['first','last'].map(name=>command(name,"require('node:fs').appendFileSync('ran',"+JSON.stringify(name+'\n')+")")),{cwd:dir,stdio:'pipe'});
  assert.equal(result.exitCode,0);
  assert.equal(result.failedCheck,null);
  assert.equal(readFileSync(join(dir,'ran'),'utf8'),'first\nlast\n');
 } finally {rmSync(dir,{recursive:true,force:true});}
});
