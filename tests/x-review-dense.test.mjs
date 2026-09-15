import test from 'node:test';
import assert from 'node:assert/strict';
import {testDatabase} from './helpers/d1.mjs';
import {readXReview} from '../src/x-review-query.mjs';
test('dense exact groups are returned as individual rows below the D1 string limit',async()=>{
 const {sqlite,DB}=testDatabase();
 try{
  sqlite.exec('BEGIN');for(let i=0;i<800;i++){const id='x:'+String(i).padStart(5,'0'),url='https://pbs.twimg.com/media/'+id+'.jpg';sqlite.prepare('INSERT INTO posts VALUES(?,?)').run(id,JSON.stringify({id,authorHandle:'sample',canonicalUrl:'https://x.com/sample/status/'+i,publishedAt:'2026-09-01',media:[{kind:'image',previewUrl:url}]}));sqlite.prepare('INSERT INTO x_fingerprints(url,hash) VALUES(?,?)').run(url,'same');}sqlite.exec('COMMIT');
  let maxCell=0;const check=row=>{for(const value of Object.values(row??{}))if(typeof value==='string'){maxCell=Math.max(maxCell,Buffer.byteLength(value));assert.ok(Buffer.byteLength(value)<2_000_000,'D1 strings must not aggregate a dense comparison group');}return row;};
  const measured={prepare(sql){const stmt=DB.prepare(sql),all=stmt.all.bind(stmt),first=stmt.first.bind(stmt);stmt.first=async()=>check(await first());stmt.all=async()=>{const result=await all();result.results.forEach(check);return result;};return stmt;}};
  const result=await readXReview(measured,new URLSearchParams({status:'all'}));assert.equal(result.items.length,25);assert.equal(result.items[0].comparisons.length,799);assert.equal(result.counts.visible,1);assert.ok(maxCell<10000);
 }finally{sqlite.close();}
});
