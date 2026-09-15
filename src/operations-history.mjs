import {readXReview} from './x-review-query.mjs';

const dayMs=86400000;
const kstDay=now=>new Date(now+9*3600000).toISOString().slice(0,10);
const shiftDay=(day,offset)=>new Date(Date.parse(day+'T00:00:00Z')+offset*dayMs).toISOString().slice(0,10);
const metric=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;

export async function recordOperationsSnapshot(env,now=Date.now()){
 const {DB}=env,day=kstDay(now);
 if(await DB.prepare('SELECT day FROM operations_history WHERE day=?').bind(day).first())return {status:'skipped',day};
 // all() retains the D1 size metadata that first() would discard.
 const counts=await DB.prepare('SELECT (SELECT COUNT(*) FROM posts) AS x,(SELECT COUNT(*) FROM instagram_review) AS instagram,(SELECT COUNT(*) FROM manual_posts) AS manual').all();
 const totals=counts.results[0];
 let query={status:'failed',sqlMs:null,rowsRead:null,resultBytes:null};
 try{
  await readXReview(DB,new URLSearchParams({status:'all',offset:'0'}),({meta,resultBytes})=>{
   query={status:'ok',sqlMs:metric(meta?.timings?.sql_duration_ms)??metric(meta?.duration),rowsRead:metric(meta?.rows_read),resultBytes:metric(resultBytes)};
  });
 }catch{ /* A failed representative read must not erase the day's stored counts. */ }
 const result=await DB.prepare(`INSERT INTO operations_history
  (day,captured_at,x_total,instagram_total,manual_total,database_bytes,query_version,query_status,query_sql_ms,query_rows_read,query_result_bytes)
  VALUES(?,?,?,?,?,?,'x-review-v1',?,?,?,?) ON CONFLICT(day) DO NOTHING`)
  .bind(day,new Date(now).toISOString(),totals.x,totals.instagram,totals.manual,metric(counts.meta?.size_after),query.status,query.sqlMs,query.rowsRead,query.resultBytes).run();
 return {status:result.meta?.changes===0?'skipped':'recorded',day};
}

export async function readOperationsHistory(DB,now=Date.now()){
 const today=kstDay(now),first=shiftDay(today,-29);
 // Include one earlier day only to calculate the oldest displayed day's delta.
 const {results}=await DB.prepare('SELECT day,captured_at,x_total,instagram_total,manual_total,database_bytes,query_version,query_status,query_sql_ms,query_rows_read,query_result_bytes FROM operations_history WHERE day>=? AND day<=? ORDER BY day DESC').bind(shiftDay(first,-1),today).all();
 const byDay=new Map(results.map(row=>[row.day,row]));
 const difference=(a,b)=>a===null||a===undefined||b===null||b===undefined?null:a-b;
 return {items:results.filter(row=>row.day>=first).map(row=>{
  const prior=byDay.get(shiftDay(row.day,-1));
  return {day:row.day,capturedAt:row.captured_at,totals:{x:row.x_total,instagram:row.instagram_total,manual:row.manual_total},databaseBytes:row.database_bytes,
   query:{version:row.query_version,status:row.query_status,sqlMs:row.query_sql_ms,rowsRead:row.query_rows_read,resultBytes:row.query_result_bytes},
   delta:prior?{x:difference(row.x_total,prior.x_total),instagram:difference(row.instagram_total,prior.instagram_total),manual:difference(row.manual_total,prior.manual_total),databaseBytes:difference(row.database_bytes,prior.database_bytes)}:null};
 })};
}
