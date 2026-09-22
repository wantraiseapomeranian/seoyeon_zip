import test from 'node:test';
import assert from 'node:assert/strict';
import {testDatabase} from './helpers/d1.mjs';
import {readXReview} from '../src/x-review-query.mjs';
import * as history from '../src/operations-history.mjs';
const at=day=>Date.parse(day+'T03:00:00Z');
function database(options={}){
 const base=testDatabase(),sql=[];
 const DB={prepare(query){
  sql.push(query);const statement=base.DB.prepare(query),all=statement.all.bind(statement),run=statement.run.bind(statement);
  statement.all=async()=>{
   if(query.startsWith('WITH')&&options.queryError)throw Error('query failed');
   if(query.includes('COUNT(*) FROM posts')&&options.countError)throw Error('count failed');
   const result=await all();
   result.meta=options.meta??{size_after:8192,timings:{sql_duration_ms:1.75},duration:20,rows_read:42};
   return result;
  };
  statement.run=async()=>{if(options.writeError)throw Error('write failed');return run();};
  return statement;
 }};
 return {...base,DB,sql};
}

test('optional X measurement reports D1 metadata and UTF-8 response bytes',async()=>{
 const {DB}=database();let measured;
 const result=await readXReview(DB,new URLSearchParams({status:'all'}),value=>{measured=value;});
 assert.equal(measured?.meta.rows_read,42);
 assert.equal(measured.resultBytes,Buffer.byteLength(JSON.stringify(result)));
});

test('snapshot records KST day and raw counts, then cheaply keeps first successful capture',async()=>{
 assert.equal(typeof history.recordOperationsSnapshot,'function');
 const {DB,sqlite,sql}=database();
 sqlite.exec("INSERT INTO posts VALUES('1','{}'); INSERT INTO instagram_review(code,data,imported_at) VALUES('a','{}','2026-09-15'); INSERT INTO manual_posts VALUES('m','https://example.com','{}','2026-09-15')");
 const time=Date.parse('2026-09-14T15:00:00Z');
 await history.recordOperationsSnapshot({DB},time);
 const result=await history.readOperationsHistory(DB,time);
 assert.equal(result.items.length,1);
 assert.deepEqual(result.items[0],{day:'2026-09-15',capturedAt:'2026-09-14T15:00:00.000Z',totals:{x:1,instagram:1,manual:1,youtube:0},databaseBytes:8192,query:{version:'x-review-v1',status:'ok',sqlMs:1.75,rowsRead:42,resultBytes:result.items[0].query.resultBytes},delta:null});
 assert.ok(result.items[0].query.resultBytes>0);
 sqlite.exec("INSERT INTO posts VALUES('2','{}')");sql.length=0;
 await history.recordOperationsSnapshot({DB},time+1000);
 assert.equal(sql.length,1);
 assert.equal((await history.readOperationsHistory(DB,time)).items[0].totals.x,1);
});

test('query failure retains counts, missing metadata stays null, and duration fallback works',async()=>{
 assert.equal(typeof history.recordOperationsSnapshot,'function');
 for(const options of [{queryError:true},{meta:{}},{meta:{duration:4,rows_read:0}}]){
  const {DB}=database(options);
  await history.recordOperationsSnapshot({DB},at('2026-09-15'));
  const row=(await history.readOperationsHistory(DB,at('2026-09-15'))).items[0];
  assert.deepEqual(row.totals,{x:0,instagram:0,manual:0,youtube:0});
  assert.equal(row.query.status,options.queryError?'failed':'ok');
  assert.equal(row.query.sqlMs,options.meta?.duration??null);
  assert.equal(row.query.rowsRead,options.queryError?null:options.meta?.rows_read??null);
  assert.equal(row.databaseBytes,options.queryError?8192:null);
  if(options.queryError)assert.equal(row.query.resultBytes,null);
 }
});

test('count and insert failures leave day retryable; concurrent captures keep one row',async()=>{
 assert.equal(typeof history.recordOperationsSnapshot,'function');
 for(const failure of ['countError','writeError']){
  const options={[failure]:true},{DB,sqlite}=database(options);
  await assert.rejects(history.recordOperationsSnapshot({DB},at('2026-09-15')));
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM operations_history').get().n,0);
  options[failure]=false;
  await Promise.all([history.recordOperationsSnapshot({DB},at('2026-09-15')),history.recordOperationsSnapshot({DB},at('2026-09-15'))]);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM operations_history').get().n,1);
 }
});

test('history reads only, bounds 30 KST calendar days and computes only consecutive deltas',async()=>{
 assert.equal(typeof history.recordOperationsSnapshot,'function');
 const {DB,sqlite,sql}=database();
 for(const day of ['2026-08-15','2026-08-16','2026-08-17','2026-09-13','2026-09-15','2026-09-16']){
  sqlite.prepare('INSERT INTO posts VALUES(?,?)').run(day,'{}');
  await history.recordOperationsSnapshot({DB},at(day));
 }
 sql.length=0;
 const {items}=await history.readOperationsHistory(DB,Date.parse('2026-09-14T15:00:00Z'));
 assert.deepEqual(items.map(row=>row.day),['2026-09-15','2026-09-13','2026-08-17']);
 assert.equal(items[0].delta,null);assert.equal(items[1].delta,null);
 assert.deepEqual(items[2].delta,{x:1,instagram:0,manual:0,youtube:0,databaseBytes:0});
 assert.ok(sql.every(query=>/^SELECT\b/.test(query)));
});
