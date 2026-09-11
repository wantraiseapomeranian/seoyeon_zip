import test from 'node:test';
import assert from 'node:assert/strict';
import {handleApi} from '../src/worker.mjs';
import {testDatabase} from './helpers/d1.mjs';

const context={actor:{id:'owner@example.test'}};
const request=query=>new Request('https://example.test/api/admin/review-audit'+query);
test('audit read requires server actor even when internal router is called directly',async()=>{
  const DB={prepare(){throw new Error('must not read');}};
  assert.equal((await handleApi(request(''),{DB})).status,401);
});
test('audit query validates all filters and cursors before touching the database',async()=>{
  let reads=0;const DB={prepare(){reads++;throw new Error('must not read');}};
  for(const query of ['?platform=twitter','?action=DELETE','?from=2026-02-30','?to=2026-13-01','?from=2026-09-12&to=2026-09-11','?cursor=bad','?platform=X&platform=INSTAGRAM'])
    assert.equal((await handleApi(request(query),{DB},context)).status,400,query);
  assert.equal(reads,0);
});

function seed(sqlite,{id,time='2026-09-10T15:00:00.000Z',platform='X',action='HIDE',target='x:123',type='POST',metadata={author:'writer',url:'https://x.com/writer/status/123',candidateEvidence:{distance:3}}}) {
  sqlite.prepare(`INSERT INTO review_audit_log(id,request_id,request_fingerprint,platform,target_type,target_id,action,previous_state,new_state,reason_code,note,reviewed_by,reviewed_at,metadata_json) VALUES(?,?,?,?,?,?,?,'{"decision":"auto"}','{"decision":"hide"}','OTHER','note','owner@example.test',?,?)`).run(id,id,'fingerprint',platform,type,target,action,time,JSON.stringify(metadata));
}

test('keyset pagination preserves same-time events without duplicates or omissions and binds filters',async()=>{
  const {sqlite,DB}=testDatabase();
  try {
    for(let n=0;n<53;n++)seed(sqlite,{id:'event-'+String(n).padStart(3,'0')});
    seed(sqlite,{id:'different-platform',platform:'INSTAGRAM',action:'EXCLUDE'});
    const first=await (await handleApi(request('?platform=X'),{DB},context)).json();
    assert.equal(first.items.length,25);assert.equal(first.items[0].id,'event-052');assert.equal(first.items[24].id,'event-028');
    assert.equal(typeof first.startedAt,'string');assert.ok(first.nextCursor);
    assert.deepEqual(first.items[0].summary,{author:'writer',url:'https://x.com/writer/status/123',thumbnailUrl:null,thumbnailSource:null});
    assert.equal('metadata' in first.items[0],false);assert.equal('previousState' in first.items[0],false);
    const second=await (await handleApi(request('?platform=X&cursor='+first.nextCursor),{DB},context)).json();
    const third=await (await handleApi(request('?platform=X&cursor='+second.nextCursor),{DB},context)).json();
    assert.equal(second.items.length,25);assert.equal(third.items.length,3);assert.equal(third.nextCursor,null);
    const ids=[...first.items,...second.items,...third.items].map(row=>row.id);
    assert.equal(new Set(ids).size,53);assert.equal(ids.at(-1),'event-000');
    let reads=0;const blockedDB={prepare(){reads++;throw new Error('should not read');}};
    for(const query of ['?cursor=','?platform=INSTAGRAM&cursor=','?platform=X&action=HIDE&cursor='])
      assert.equal((await handleApi(request(query+first.nextCursor),{DB:blockedDB},context)).status,400);
    assert.equal(reads,0);
  }finally{sqlite.close();}
});

test('inclusive Korean calendar days map to correct UTC boundaries with platform and action filters',async()=>{
  const {sqlite,DB}=testDatabase();
  try {
    seed(sqlite,{id:'before',time:'2026-09-10T14:59:59.999Z'});
    seed(sqlite,{id:'start',time:'2026-09-10T15:00:00.000Z'});
    seed(sqlite,{id:'end',time:'2026-09-11T14:59:59.999Z'});
    seed(sqlite,{id:'after',time:'2026-09-11T15:00:00.000Z'});
    seed(sqlite,{id:'other-action',action:'SHOW'});
    seed(sqlite,{id:'other-platform',platform:'INSTAGRAM',action:'EXCLUDE'});
    const response=await handleApi(request('?platform=X&action=HIDE&from=2026-09-11&to=2026-09-11'),{DB},context);
    assert.equal(response.status,200);assert.deepEqual((await response.json()).items.map(row=>row.id),['end','start']);
    const empty=await (await handleApi(request('?from=2026-09-13'),{DB},context)).json();
    assert.deepEqual(empty.items,[]);assert.equal(empty.nextCursor,null);assert.ok(empty.startedAt);
  }finally{sqlite.close();}
});

test('detail returns immutable snapshots and full metadata, unknown IDs return 404, writes are rejected',async()=>{
  const {sqlite,DB}=testDatabase();
  try {
    seed(sqlite,{id:'event-1'});
    const response=await handleApi(request('/event-1'),{DB},context);assert.equal(response.status,200);
    assert.equal(response.headers.get('cache-control'),'private, no-store');
    const {item}=await response.json();
    assert.deepEqual(item.previousState,{decision:'auto'});assert.deepEqual(item.newState,{decision:'hide'});
    assert.deepEqual(item.metadata.candidateEvidence,{distance:3});assert.equal(item.reviewedBy,'owner@example.test');
    assert.equal((await handleApi(request('/missing'),{DB},context)).status,404);
    assert.equal((await handleApi(new Request(request(''),{method:'POST'}),{DB},context)).status,405);
  }finally{sqlite.close();}
});

test('database outages return sanitized 503 for list and detail',async()=>{
  const DB={prepare(){throw new Error('secret SQL');}};
  for(const suffix of ['','/event-1']) {
    const response=await handleApi(request(suffix),{DB},context);
    assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'review_audit_unavailable'});
  }
});

test('cursor rejects impossible timestamps and malformed identity before database access',async()=>{
  const DB={prepare(){assert.fail('invalid cursor must not query');}};
  for(const [time,id] of [['2026-02-30T00:00:00.000Z','event-1'],['2026-09-01T00:00:00.000Z',''],['2026-09-01T00:00:00.000Z',"' OR 1=1"],['2026-09-01','event-1']]) {
    const cursor=Buffer.from(JSON.stringify({v:1,filters:{platform:null,action:null,from:null,to:null},time,id})).toString('base64url');
    assert.equal((await handleApi(request('?cursor='+cursor),{DB},context)).status,400);
  }
});

test('thumbnails prefer immutable evidence and legacy previews never rewrite history',async()=>{
 const {sqlite,DB}=testDatabase();try{
  sqlite.prepare('INSERT INTO posts VALUES(?,?)').run('x:123',JSON.stringify({media:[{previewUrl:'https://pbs.twimg.com/media/current.jpg'}]}));
  sqlite.prepare('INSERT INTO instagram_review(code,data,imported_at) VALUES(?,?,?)').run('Thumb_123',JSON.stringify({images:['https://a.cdninstagram.com/current.jpg']}),'2026-09-11');
  seed(sqlite,{id:'legacy-x',metadata:{}});seed(sqlite,{id:'legacy-ig',platform:'INSTAGRAM',action:'KEEP',target:'ig:Thumb_123',metadata:{}});
  seed(sqlite,{id:'snapshot',metadata:{thumbnailUrl:'https://pbs.twimg.com/media/then.jpg'}});
  seed(sqlite,{id:'pair',type:'IMAGE_PAIR',metadata:{leftImageUrl:'https://pbs.twimg.com/media/selected.jpg',images:[{url:'https://pbs.twimg.com/media/other.jpg'}]}});
  const before=sqlite.prepare('SELECT * FROM review_audit_log ORDER BY id').all();const items=(await (await handleApi(request(''),{DB},context)).json()).items;const summary=id=>items.find(i=>i.id===id).summary;
  assert.equal(summary('legacy-x').thumbnailSource,'current');assert.equal(summary('legacy-ig').thumbnailUrl,'https://a.cdninstagram.com/current.jpg');assert.equal(summary('snapshot').thumbnailSource,'snapshot');assert.equal(summary('snapshot').thumbnailUrl,'https://pbs.twimg.com/media/then.jpg');assert.equal(summary('pair').thumbnailUrl,'https://pbs.twimg.com/media/selected.jpg');
  sqlite.prepare('DELETE FROM posts WHERE id=?').run('x:123');assert.equal((await (await handleApi(request('/legacy-x'),{DB},context)).json()).item.summary.thumbnailUrl,null);assert.deepEqual(sqlite.prepare('SELECT * FROM review_audit_log ORDER BY id').all(),before);
 }finally{sqlite.close();}
});
