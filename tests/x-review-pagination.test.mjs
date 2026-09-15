import test from 'node:test';
import assert from 'node:assert/strict';
import {testDatabase} from './helpers/d1.mjs';
import {legacyXReview} from './helpers/x-review-legacy.mjs';
import {handleXReview} from '../src/x-review.mjs';

function post(sqlite,id,extra={}) {
 const data={id,canonicalUrl:`https://x.com/test/status/${id}`,authorHandle:'Tester',publishedAt:'2026-08-31T15:00:00.000Z',contentKind:'fansite',text:`body ${id}`,media:[{kind:'image',previewUrl:`https://img.test/${id}`}],...extra};
 sqlite.prepare('INSERT INTO posts(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(id,JSON.stringify(data));
 return data;
}
function quality(sqlite,id,decision='auto',availability='unknown') {
 sqlite.prepare('INSERT INTO x_quality(post_id,decision,availability,revision,checked_at,missing_count) VALUES(?,?,?,3,12345,2) ON CONFLICT(post_id) DO UPDATE SET decision=excluded.decision,availability=excluded.availability,revision=revision+1').run(id,decision,availability);
}
function fingerprint(sqlite,url,hash,confirmed=null,near=null) {
 sqlite.prepare('INSERT INTO x_fingerprints(url,hash,confirmed_hash,near_url) VALUES(?,?,?,?) ON CONFLICT(url) DO UPDATE SET hash=excluded.hash,confirmed_hash=excluded.confirmed_hash,near_url=excluded.near_url').run(url,hash,confirmed,near);
}
async function equivalent(DB,query='status=all') {
 const actual=await handleXReview(new Request(`https://review.test/api/x-review?${query}`),{DB});
 const expected=await legacyXReview(DB,new URLSearchParams(query));
 assert.equal(actual.status,expected.status,query);
 const data=await actual.json();
 assert.deepEqual(data,await expected.json(),query);
 return data;
}
function fixture(sqlite) {
 for(let i=0;i<64;i++) {
  const id=`post-${String(i).padStart(3,'0')}`;
  post(sqlite,id,{authorHandle:['Tester','another','tEsTeR'][i%3],contentKind:['cosmo','fansite','official','other'][i%4],publishedAt:['2026-08-31T14:59:59.000Z','2026-08-31T15:00:00.000Z','2026-09-30T15:00:00.000Z'][i%3],media:i%7===0?[]:[{kind:['image','video','gif','unknown'][i%4],previewUrl:`https://img.test/${id}`}],...(i%9===0?{moderationReason:'review'}:{}),...(i%11===0?{author:'Override'}:{})});
  if(i%5===0)quality(sqlite,id,'hidden');
  else if(i%7===0)quality(sqlite,id,'auto','missing');
  else if(i%4===0)quality(sqlite,id,'visible');
 }
 const media=image=>({kind:'image',previewUrl:`https://img.test/${image}`});
 for(const [id,images] of [['a',['a','a','b']],['b',['b']],['c',['c']],['d',['d']],['empty',['empty']],['empty2',['empty2']],['no-hash',['no-hash']],['excluded',['excluded']]])post(sqlite,id,{media:images.map(media),publishedAt:'2027-01-01T00:00:00Z',authorHandle:id});
 fingerprint(sqlite,'https://img.test/a','raw-a','same','https://img.test/c');
 fingerprint(sqlite,'https://img.test/b','raw-b','same');
 fingerprint(sqlite,'https://img.test/c','different',null,'https://img.test/d');
 fingerprint(sqlite,'https://img.test/d','raw-d',null,'https://img.test/a');
 fingerprint(sqlite,'https://img.test/empty','raw-empty','','https://img.test/empty2');
 fingerprint(sqlite,'https://img.test/empty2','raw-empty2','');
 fingerprint(sqlite,'https://img.test/no-hash',null,'same','https://img.test/a');
 fingerprint(sqlite,'https://img.test/excluded','other',null,'https://img.test/a');
 sqlite.prepare('INSERT INTO x_photo_differences VALUES(?,?)').run('https://img.test/a','https://img.test/excluded');
 quality(sqlite,'b','hidden');quality(sqlite,'c','auto','missing');quality(sqlite,'d','visible');
}

test('X SQL pagination preserves the frozen GET response across filters, pages and comparison metadata',async()=>{
 const {sqlite,DB}=testDatabase();
 try {
  fixture(sqlite);
  const filters=['','date=2026-09-01','month=2026-09','month=2026-10','date=2026-09-01&month=2026-10','media=image','media=video','media=unknown','author=TESTER','author=override','kind=cosmo','kind=fansite','kind=official','kind=other','author=absent','date=2026-09-01&media=video&kind=fansite','author=a','author=empty'];
  for(const status of ['all','pending','visible','hidden'])for(const filter of filters)for(const offset of [0,25,50,100000])await equivalent(DB,`status=${status}&offset=${offset}&${filter}`);
  for(const query of ['status=nope','offset=-1','offset=1.2','offset=100001','date=2026-02-30','month=2026-13','media=gif','author=a-b','kind=nope'])await equivalent(DB,query);
  const data=await equivalent(DB,'status=all&author=a');
  assert.ok(data.items[0].comparisons.length>5,'repeated photos and cross-filter candidates are retained');
  assert.ok(data.items[0].comparisons.some(p=>p.postId==='b'&&p.decision==='hidden'&&p.exact));
  assert.ok(data.items[0].comparisons.some(p=>p.postId==='c'&&!p.exact));
  assert.ok(!data.items[0].comparisons.some(p=>['no-hash','excluded'].includes(p.postId)));
 } finally {sqlite.close();}
});

test('X pagination observes post upserts, updates, deletes and live review/photo decisions',async()=>{
 const {sqlite,DB}=testDatabase();
 try {
  post(sqlite,'a');post(sqlite,'b');
  await equivalent(DB);
  post(sqlite,'a',{authorHandle:'NewAuthor',author:'Override',publishedAt:'2026-10-01T00:00:00Z',contentKind:'official',media:[{kind:'gif',previewUrl:'https://img.test/changed'}],moderationReason:'new'});
  await equivalent(DB,'status=pending&author=override&month=2026-10&media=video&kind=official');
  sqlite.prepare("UPDATE posts SET data=json_set(data,'$.author','Direct','$.media',json(?)) WHERE id='a'").run(JSON.stringify([{kind:'image',previewUrl:'https://img.test/a'}]));
  await equivalent(DB,'status=all&author=direct');
  fingerprint(sqlite,'https://img.test/a','hash-a',null,'https://img.test/b');
  fingerprint(sqlite,'https://img.test/b','hash-b');
  await equivalent(DB,'status=pending');
  quality(sqlite,'b','hidden','missing');await equivalent(DB);
  sqlite.prepare('INSERT INTO x_photo_differences VALUES(?,?)').run('https://img.test/a','https://img.test/b');await equivalent(DB,'status=pending');
  fingerprint(sqlite,'https://img.test/b','hash-b','hash-a');await equivalent(DB);
  fingerprint(sqlite,'https://img.test/a','hash-a','');await equivalent(DB);
  sqlite.exec("DELETE FROM x_photo_differences; DELETE FROM x_fingerprints WHERE url='https://img.test/b'; DELETE FROM x_quality WHERE post_id='b'");await equivalent(DB);
  sqlite.exec("DELETE FROM posts WHERE id='b'");await equivalent(DB);
 } finally {sqlite.close();}
});

test('X pagination preserves empty results, JSON nulls, false moderation and raw date ordering',async()=>{
 const {sqlite,DB}=testDatabase();
 try {
  await equivalent(DB);await equivalent(DB,'status=pending&offset=25');
  for(const [id,extra] of [
   ['z-first',{moderationReason:'',author:'',publishedAt:'2026-09-01T01:00:00+09:00'}],
   ['a-second',{moderationReason:false,author:null,publishedAt:'2026-08-31T20:00:00Z'}],
   ['m-third',{moderationReason:0,media:null,publishedAt:null}],
   ['d-fourth',{moderationReason:null,media:[],publishedAt:'2026-08-31T17:00:00Z'}],
   ['b-fifth',{authorHandle:'',publishedAt:'2026-08-31T20:00:00Z'}]
  ])post(sqlite,id,extra);
  for(const query of ['status=all','status=pending','status=visible','status=hidden','status=all&media=unknown','status=all&author=tester','status=all&date=2026-09-01','status=all&month=2026-09'])await equivalent(DB,query);
 } finally {sqlite.close();}
});

test('X page query transports bounded post bodies and photos for 3000 unrelated posts',async()=>{
 const {sqlite,DB}=testDatabase();
 try {
  sqlite.exec('BEGIN');
  for(let i=0;i<3000;i++){const id=`bulk-${String(i).padStart(5,'0')}`;post(sqlite,id,{text:'x'.repeat(2048)});fingerprint(sqlite,`https://img.test/${id}`,`hash-${i}`);}
  sqlite.exec('COMMIT');
  const observations=[];
  const measured={...DB,prepare(sql){const stmt=DB.prepare(sql),all=stmt.all.bind(stmt),first=stmt.first.bind(stmt);stmt.all=async()=>{const result=await all();observations.push({sql,rows:result.results.length,bytes:JSON.stringify(result.results).length});return result;};stmt.first=async()=>{const result=await first();observations.push({sql,rows:result?1:0,bytes:JSON.stringify(result).length});return result;};return stmt;}};
  const response=await handleXReview(new Request('https://review.test/api/x-review?status=all'),{DB:measured});
  assert.equal(response.status,200);
  const data=await response.json();assert.equal(data.total,3000);assert.equal(data.items.length,25);
  assert.ok(observations.every(o=>o.rows<=100),`unrelated queries must not transport dataset-sized metadata: ${JSON.stringify(observations)}`);
  assert.ok(observations.reduce((n,o)=>n+o.bytes,0)<200000,`transport must scale with page size: ${JSON.stringify(observations)}`);
 } finally {sqlite.close();}
});
