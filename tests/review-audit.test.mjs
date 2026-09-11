import test from 'node:test';
import assert from 'node:assert/strict';
import {testDatabase} from './helpers/d1.mjs';
import {handleXReview} from '../src/x-review.mjs';
import {handleInstagramReview} from '../src/instagram-review.mjs';

const actor={actor:{id:'owner@example.test'}};
const reasons={visible:'SEOYEON_CONFIRMED',hidden:'NOT_SEOYEON',auto:'RETURN_TO_AUTO',kept:'SEOYEON_CONFIRMED',excluded:'NOT_SEOYEON',held:'NEEDS_REVIEW',pending:'NEEDS_REVIEW',merge:'DUPLICATE_IMAGE',different:'DISTINCT_IMAGE',unmerge:'GROUP_CORRECTION'};
const input=body=>({requestId:crypto.randomUUID(),reasonCode:reasons[body.action??body.decision??body.status],...body});
const request=(path,body)=>new Request('https://test.local/api/admin/'+path,{method:'POST',headers:{origin:'https://test.local','content-type':'application/json','x-review-action':'review'},body:JSON.stringify(body)});
const sendX=(DB,body,context=actor)=>handleXReview(request('x',body),{DB},context);
const sendIG=(DB,body,context=actor)=>handleInstagramReview(request('instagram/Audit_123',body),{DB},context);
function setup(t){const db=testDatabase();t.after(()=>db.sqlite.close());return db;}
function post(sqlite,id='x:1',images=[]){sqlite.prepare('INSERT INTO posts VALUES(?,?)').run(id,JSON.stringify({id,authorHandle:'example',canonicalUrl:'https://x.com/example/status/'+id.slice(2),caption:'서연',moderationReason:'notice',media:images.map(previewUrl=>({kind:'image',previewUrl}))}));}
function instagram(sqlite){sqlite.prepare('INSERT INTO instagram_review(code,data,imported_at) VALUES(?,?,?)').run('Audit_123',JSON.stringify({author:'example',url:'https://www.instagram.com/p/Audit_123/'}),'2026-09-01T00:00:00Z');}
const events=sqlite=>sqlite.prepare('SELECT * FROM review_audit_log ORDER BY rowid').all();
const breakAudit=sqlite=>sqlite.exec("CREATE TRIGGER audit_fault BEFORE INSERT ON review_audit_log BEGIN SELECT RAISE(ABORT,'simulated audit storage failure'); END");
const groupState=sqlite=>({fingerprints:sqlite.prepare('SELECT * FROM x_fingerprints ORDER BY url').all(),differences:sqlite.prepare('SELECT * FROM x_photo_differences ORDER BY left_url,right_url').all(),revision:sqlite.prepare('SELECT * FROM x_group_control').all()});

test('review mutations require server actor and modern request fields',async t=>{
 const {sqlite,DB}=setup(t);post(sqlite);instagram(sqlite);
 for(const [send,body] of [[sendX,{id:'x:1',decision:'hidden',revision:0}],[sendIG,{status:'kept',revision:0}]]){
  assert.equal((await send(DB,input(body),{})).status,401);
  const outdated=await send(DB,body);assert.equal(outdated.status,400);assert.equal((await outdated.json()).error,'review_client_outdated');
  for(const extra of [{reasonCode:'INVENTED'},{requestId:'not-a-uuid'},{note:'x'.repeat(1001)},{reasonCode:'DISTINCT_IMAGE'},{reviewedBy:'attacker'},{reviewedAt:'1900-01-01'}])assert.equal((await send(DB,input({...body,...extra}))).status,400);
 }
 assert.equal(events(sqlite).length,0);assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM x_quality').get().n,0);
});

test('X audit preserves real decisions, server identity and each sequential change',async t=>{
 const {sqlite,DB}=setup(t);post(sqlite);
 for(const [revision,decision] of ['hidden','visible','hidden','auto'].entries()){
  const response=await sendX(DB,input({id:'x:1',decision,revision,note:'<script>literal note</script>'}));
  assert.equal(response.status,200);const body=await response.json();assert.equal(body.changed,true);assert.ok(body.auditId);
 }
 const rows=events(sqlite);assert.deepEqual(rows.map(e=>e.action),['HIDE','SHOW','HIDE','RESET_AUTO']);
 assert.deepEqual(rows.map(e=>e.target_id),Array(4).fill('x:1'));
 assert.deepEqual(rows.map(e=>JSON.parse(e.previous_state).decision),['auto','hidden','visible','hidden']);
 assert.deepEqual(rows.map(e=>JSON.parse(e.new_state).decision),['hidden','visible','hidden','auto']);
 for(const row of rows){assert.equal(row.reviewed_by,actor.actor.id);assert.ok(Date.parse(row.reviewed_at)>Date.parse('2026-01-01'));assert.equal(row.note,'<script>literal note</script>');}
 assert.throws(()=>sqlite.prepare('UPDATE review_audit_log SET note=? WHERE id=?').run('changed',rows[0].id),/audit_append_only/);
 assert.throws(()=>sqlite.prepare('DELETE FROM review_audit_log WHERE id=?').run(rows[0].id),/audit_append_only/);
});

test('Instagram four transitions each record the actual previous and new state',async t=>{
 const {sqlite,DB}=setup(t);instagram(sqlite);
 for(const [revision,status] of ['kept','excluded','held','pending'].entries())assert.equal((await sendIG(DB,input({status,revision}))).status,200);
 const rows=events(sqlite);assert.deepEqual(rows.map(e=>e.action),['KEEP','EXCLUDE','HOLD','RESET_PENDING']);
 assert.deepEqual(rows.map(e=>JSON.parse(e.previous_state).status),['pending','kept','excluded','held']);assert.deepEqual(rows.map(e=>JSON.parse(e.new_state).status),['kept','excluded','held','pending']);
 assert.ok(rows.every(e=>e.platform==='INSTAGRAM'&&e.target_id==='ig:Audit_123'));
});

test('successful request replay returns its audit id; altered content or actor conflicts',async t=>{
 const {sqlite,DB}=setup(t);post(sqlite);
 const body=input({id:'x:1',decision:'hidden',revision:0});const first=await (await sendX(DB,body)).json();
 const replay=await sendX(DB,body);assert.equal(replay.status,200);assert.equal((await replay.json()).auditId,first.auditId);
 assert.equal((await sendX(DB,{...body,note:'different'})).status,409);
 assert.equal((await sendX(DB,body,{actor:{id:'another@example.test'}})).status,409);
 assert.equal(events(sqlite).length,1);assert.equal(sqlite.prepare('SELECT revision FROM x_quality').get().revision,1);
});

test('same-state requests do not advance revisions or add audit rows',async t=>{
 const {sqlite,DB}=setup(t);post(sqlite);instagram(sqlite);
 for(const [send,body] of [[sendX,{id:'x:1',decision:'auto',revision:0}],[sendIG,{status:'pending',revision:0}]]){
  const response=await send(DB,input(body));assert.equal(response.status,200);assert.equal((await response.json()).changed,false);
 }
 assert.equal(events(sqlite).length,0);assert.equal(sqlite.prepare('SELECT revision FROM instagram_review').get().revision,0);
});

for(const platform of ['X','INSTAGRAM'])test(platform+' audit insert failure rolls back all state, including first X quality row',async t=>{
 const {sqlite,DB}=setup(t);post(sqlite);instagram(sqlite);breakAudit(sqlite);
 const table=platform==='X'?'x_quality':'instagram_review',before=sqlite.prepare('SELECT * FROM '+table).all();
 const response=await (platform==='X'?sendX(DB,input({id:'x:1',decision:'hidden',revision:0})):sendIG(DB,input({status:'kept',revision:0})));
 assert.equal(response.status,503);assert.deepEqual(sqlite.prepare('SELECT * FROM '+table).all(),before);assert.equal(events(sqlite).length,0);
 assert.ok(!(await response.text()).includes('simulated audit'));
});

test('competing X revisions commit one event and reject the losing revision',async t=>{
 const {sqlite,DB}=setup(t);post(sqlite);
 const first=await sendX(DB,input({id:'x:1',decision:'hidden',revision:0}));const stale=await sendX(DB,input({id:'x:1',decision:'visible',revision:0}));
 assert.equal(first.status,200);assert.equal(stale.status,409);assert.equal(events(sqlite).length,1);assert.equal(sqlite.prepare('SELECT decision FROM x_quality').get().decision,'hidden');
});

for(const action of ['merge','different','unmerge'])test(action+' audit insert failure rolls back fingerprints, differences and group revision',async t=>{
 const {sqlite,DB}=setup(t);post(sqlite,'x:1',['a']);post(sqlite,'x:2',['b']);sqlite.exec("INSERT INTO x_fingerprints(url,hash,confirmed_hash,near_url) VALUES('a','ha','group','b'),('b','hb','group',NULL)");breakAudit(sqlite);
 const body=action==='unmerge'?{action,image:'a',groupRevision:0}:{action,left:'a',right:'b',groupRevision:0};
 // A merge must actually change the state to reach the failing audit insert.
 if(action!=='unmerge')sqlite.exec("UPDATE x_fingerprints SET confirmed_hash=NULL WHERE url='b'");const expected=groupState(sqlite);
 assert.equal((await sendX(DB,input(body))).status,503);assert.deepEqual(groupState(sqlite),expected);assert.equal(events(sqlite).length,0);
});

test('different-photo duplicate is a no-op and unmerge records a separate group event',async t=>{
 const {sqlite,DB}=setup(t);post(sqlite,'x:1',['a']);post(sqlite,'x:2',['b']);sqlite.exec("INSERT INTO x_fingerprints(url,hash,near_url) VALUES('a','ha','b'),('b','hb',NULL)");
 assert.equal((await sendX(DB,input({action:'different',left:'a',right:'b',groupRevision:0}))).status,200);
 const noChange=await sendX(DB,input({action:'different',left:'b',right:'a',groupRevision:1}));assert.equal(noChange.status,200);assert.equal((await noChange.json()).changed,false);assert.equal(events(sqlite).length,1);
 assert.equal((await sendX(DB,input({action:'merge',left:'a',right:'b',groupRevision:1}))).status,200);
 assert.equal((await sendX(DB,input({action:'unmerge',image:'a',groupRevision:2}))).status,200);
 assert.deepEqual(events(sqlite).map(e=>e.action),['MARK_DIFFERENT_IMAGE','MARK_SAME_IMAGE','UNMERGE']);
});

test('merging existing groups records every affected member and preserves legacy evidence as unavailable',async t=>{
 const {sqlite,DB}=setup(t);
 sqlite.exec("INSERT INTO x_fingerprints(url,hash,confirmed_hash,near_url) VALUES('a','ha','left','c'),('b','hb','left',NULL),('c','hc','right',NULL),('d','hd','right',NULL)");
 for(const [i,url] of ['a','b','c','d'].entries())post(sqlite,'x:'+(i+1),[url]);
 assert.equal((await sendX(DB,input({action:'merge',left:'a',right:'c',groupRevision:0,distance:0,threshold:999}))).status,200);
 const row=events(sqlite)[0],previous=JSON.parse(row.previous_state),next=JSON.parse(row.new_state),metadata=JSON.parse(row.metadata_json);
 for(const url of ['a','b','c','d']){assert.ok(JSON.stringify(previous).includes('"'+url+'"'));assert.ok(JSON.stringify(next).includes('"'+url+'"'));}
 assert.equal(metadata.candidateEvidence,null);assert.equal(metadata.evidenceStatus,'legacy_unavailable');assert.ok(!JSON.stringify(metadata).includes('999'));
 assert.equal(sqlite.prepare('SELECT COUNT(DISTINCT confirmed_hash) AS n FROM x_fingerprints').get().n,1);
});

test('fingerprint changes between preparation and commit conflict and produce no event',async t=>{
 const {sqlite,DB}=setup(t);post(sqlite,'x:1',['a']);post(sqlite,'x:2',['b']);sqlite.exec("INSERT INTO x_fingerprints(url,hash,near_url) VALUES('a','ha','b'),('b','hb',NULL)");
 const racingDB={...DB,async batch(statements){sqlite.exec("UPDATE x_fingerprints SET hash='new-server-hash' WHERE url='a'");return DB.batch(statements);}};
 assert.equal((await sendX(racingDB,input({action:'merge',left:'a',right:'b',groupRevision:0}))).status,409);
 assert.equal(sqlite.prepare("SELECT hash FROM x_fingerprints WHERE url='a'").get().hash,'new-server-hash');assert.equal(sqlite.prepare('SELECT revision FROM x_group_control').get().revision,0);assert.equal(events(sqlite).length,0);
});

test('saved candidate generation evidence survives review and ignores submitted measurements',async t=>{
 const {sqlite,DB}=setup(t);post(sqlite,'x:1',['a']);post(sqlite,'x:2',['b']);const evidence={schemaVersion:1,origin:'candidate_generation',generatedAt:'2026-09-01T01:00:00Z',leftImageUrl:'a',rightImageUrl:'b',algorithm:'dhash',algorithmVersion:'dhash-luma-9x8-v1',hashBits:64,sampleWidth:9,sampleHeight:8,distance:3,threshold:4,aspectRatioTolerance:0.02,leftAspectRatio:0.75,rightAspectRatio:0.752,leftDhash:'0000000000000000',rightDhash:'0000000000000007',leftHash:'ha',rightHash:'hb'};
 sqlite.prepare('INSERT INTO x_fingerprints(url,hash,near_url,candidate_metadata_json) VALUES(?,?,?,?)').run('a','ha','b',JSON.stringify(evidence));sqlite.exec("INSERT INTO x_fingerprints(url,hash) VALUES('b','hb')");
 assert.equal((await sendX(DB,input({action:'different',left:'a',right:'b',groupRevision:0,distance:999,threshold:999,candidateEvidence:{origin:'forged'}}))).status,200);
 const metadata=JSON.parse(events(sqlite)[0].metadata_json);assert.deepEqual(metadata.candidateEvidence,evidence);assert.ok(!JSON.stringify(metadata).includes('999'));assert.ok(!JSON.stringify(metadata).includes('forged'));
});

for(const platform of ['X','INSTAGRAM'])test(platform+' concurrent decision committed after snapshot makes stale batch roll back',async t=>{
 const {sqlite,DB}=setup(t);post(sqlite);instagram(sqlite);let competingResponse;
 const send=platform==='X'?sendX:sendIG,body=platform==='X'?{id:'x:1',decision:'hidden',revision:0}:{status:'kept',revision:0};
 const racingDB={...DB,async batch(statements){competingResponse=await send(DB,input(body));return DB.batch(statements);}};
 const response=await send(racingDB,input(body));assert.equal(competingResponse.status,200);assert.equal(response.status,409);assert.equal(events(sqlite).length,1);
});

test('same request committed concurrently returns the saved audit without a second mutation',async t=>{
 const {sqlite,DB}=setup(t);post(sqlite);const body=input({id:'x:1',decision:'hidden',revision:0});let saved;
 const racingDB={...DB,async batch(statements){saved=await (await sendX(DB,body)).json();return DB.batch(statements);}};
 const response=await sendX(racingDB,body);assert.equal(response.status,200);assert.equal((await response.json()).auditId,saved.auditId);assert.equal(events(sqlite).length,1);assert.equal(sqlite.prepare('SELECT revision FROM x_quality').get().revision,1);
});

test('new maintenance candidates persist generation-time algorithm measurements',async t=>{
 const {maintainX}=await import('../src/x-maintenance.mjs');const {default:jpeg}=await import('jpeg-js');
 const {sqlite,DB}=setup(t);const image='https://pbs.twimg.com/media/audit.jpg',other='https://pbs.twimg.com/media/other.jpg';post(sqlite,'x:1',[image]);
 sqlite.exec("UPDATE collection_control SET enabled=1; INSERT INTO x_quality(post_id,next_check) VALUES('x:1',9999999999)");
 sqlite.prepare('INSERT INTO x_fingerprints(url,hash,dhash,width,height) VALUES(?,?,?,?,?)').run(other,'other-file-hash','0000000000000000',9,8);
 const bytes=jpeg.encode({width:9,height:8,data:Buffer.alloc(9*8*4,255)},80).data;t.mock.method(globalThis,'fetch',async()=>new Response(bytes));
 await maintainX({DB,COLLECTION_ENABLED:'true'});
 const row=sqlite.prepare('SELECT * FROM x_fingerprints WHERE url=?').get(image);assert.equal(row.near_url,other);assert.ok(row.candidate_metadata_json);
 const evidence=JSON.parse(row.candidate_metadata_json);assert.equal(evidence.origin,'candidate_generation');assert.equal(evidence.algorithmVersion,'dhash-luma-9x8-v1');assert.equal(evidence.hashBits,64);assert.equal(evidence.distance,0);assert.equal(evidence.threshold,4);assert.equal(evidence.aspectRatioTolerance,0.02);assert.equal(evidence.leftImageUrl,image);assert.equal(evidence.rightImageUrl,other);assert.ok(Number.isFinite(Date.parse(evidence.generatedAt)));
});

test('maximum-length Unicode note is accepted by both review endpoints',async t=>{
 const {sqlite,DB}=setup(t);post(sqlite);instagram(sqlite);const note='서'.repeat(1000);
 for(const [send,body] of [[sendX,{id:'x:1',decision:'hidden',revision:0}],[sendIG,{status:'kept',revision:0}]])assert.equal((await send(DB,input({...body,note}))).status,200);
 assert.deepEqual(events(sqlite).map(row=>row.note),[note,note]);
});

test('X state records auto while metadata explains why the review screen showed pending',async t=>{
 const {sqlite,DB}=setup(t);post(sqlite);assert.equal((await sendX(DB,input({id:'x:1',decision:'visible',revision:0}))).status,200);
 const row=events(sqlite)[0];assert.equal(JSON.parse(row.previous_state).decision,'auto');const metadata=JSON.parse(row.metadata_json);assert.equal(metadata.displayState,'pending');assert.ok(metadata.reviewReasons.includes('notice'));
});

test('image target identities use sorted pair JSON and unmerge image URL hashes',async t=>{
 const {sqlite,DB}=setup(t);post(sqlite,'x:1',['a']);post(sqlite,'x:2',['b']);sqlite.exec("INSERT INTO x_fingerprints(url,hash) VALUES('a','ha'),('b','hb')");
 assert.equal((await sendX(DB,input({action:'merge',left:'b',right:'a',groupRevision:0}))).status,200);assert.equal((await sendX(DB,input({action:'unmerge',image:'b',groupRevision:1}))).status,200);
 const hash=async value=>Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))).toString('hex');const rows=events(sqlite);
 assert.equal(rows[0].target_type,'IMAGE_PAIR');assert.equal(rows[0].target_id,await hash(JSON.stringify(['a','b'])));assert.equal(rows[1].target_type,'IMAGE_GROUP');assert.equal(rows[1].target_id,await hash('b'));
});

// Inject a second operation after a read has returned its snapshot, before its caller continues.
function afterRead(DB,match,method,effect){let fired=false;return {...DB,prepare(sql){const statement=DB.prepare(sql);if(match(sql)){const original=statement[method];statement[method]=async function(){const result=await original.call(this);if(!fired){fired=true;await effect();}return result;};}return statement;}};}

for(const action of ['merge','different','unmerge'])test(action+' identical request committed after group revision read replays through the no-op branch',async t=>{
 const {sqlite,DB}=setup(t);post(sqlite,'x:1',['a']);post(sqlite,'x:2',['b']);
 sqlite.exec("INSERT INTO x_fingerprints(url,hash) VALUES('a','ha'),('b','hb')");
 if(action==='unmerge')sqlite.exec("UPDATE x_fingerprints SET confirmed_hash='existing-group'");
 const body=input(action==='unmerge'?{action,image:'a',groupRevision:0}:{action,left:'a',right:'b',groupRevision:0});let saved,committedState;
 const racingDB=afterRead(DB,sql=>sql==='SELECT revision FROM x_group_control WHERE id=1','first',async()=>{
  const response=await sendX(DB,body);assert.equal(response.status,200);saved=await response.json();committedState=groupState(sqlite);
 });
 const response=await sendX(racingDB,body);assert.equal(response.status,200);assert.deepEqual(await response.json(),saved);
 assert.equal(saved.changed,true);assert.ok(saved.auditId);assert.equal(events(sqlite).length,1);assert.deepEqual(groupState(sqlite),committedState);
});

test('distinct photo request becoming a no-op after concurrent commit rejects its stale group revision',async t=>{
 const {sqlite,DB}=setup(t);post(sqlite,'x:1',['a']);post(sqlite,'x:2',['b']);sqlite.exec("INSERT INTO x_fingerprints(url,hash) VALUES('a','ha'),('b','hb')");
 const body=input({action:'different',left:'a',right:'b',groupRevision:0});let committedState;
 const racingDB=afterRead(DB,sql=>sql==='SELECT revision FROM x_group_control WHERE id=1','first',async()=>{
  assert.equal((await sendX(DB,{...body,requestId:crypto.randomUUID()})).status,200);committedState=groupState(sqlite);
 });
 assert.equal((await sendX(racingDB,body)).status,409);assert.equal(events(sqlite).length,1);assert.deepEqual(groupState(sqlite),committedState);
});

for(const platform of ['X','INSTAGRAM','PHOTO'])test(platform+' identical request committed after replay lookup returns its original audit id',async t=>{
 const {sqlite,DB}=setup(t);post(sqlite,'x:1',['a']);post(sqlite,'x:2',['b']);instagram(sqlite);sqlite.exec("INSERT INTO x_fingerprints(url,hash) VALUES('a','ha'),('b','hb')");
 const send=platform==='INSTAGRAM'?sendIG:sendX,body=input(platform==='INSTAGRAM'?{status:'kept',revision:0}:platform==='PHOTO'?{action:'merge',left:'a',right:'b',groupRevision:0}:{id:'x:1',decision:'hidden',revision:0});let saved;
 const racingDB=afterRead(DB,sql=>sql.includes('FROM review_audit_log WHERE request_id='),'first',async()=>{const result=await send(DB,body);assert.equal(result.status,200);saved=await result.json();});
 const response=await send(racingDB,body);assert.equal(response.status,200);assert.equal((await response.json()).auditId,saved.auditId);assert.equal(events(sqlite).length,1);
});

for(const change of ['group membership','candidate evidence'])test('selected fingerprint '+change+' changing before the group snapshot rejects stale preparation',async t=>{
 const {sqlite,DB}=setup(t);for(const [i,image] of ['a','b','c'].entries())post(sqlite,'x:'+(i+1),[image]);sqlite.exec("INSERT INTO x_fingerprints(url,hash,confirmed_hash,near_url) VALUES('a','ha','group-a','b'),('b','hb','group-b',NULL),('c','hc','new-group',NULL)");
 let concurrentState;
 const racingDB=afterRead(DB,sql=>sql.startsWith('SELECT * FROM x_fingerprints WHERE url IN'),'all',async()=>{
  if(change==='group membership')sqlite.exec("UPDATE x_fingerprints SET confirmed_hash='new-group' WHERE url='a'");
  else sqlite.prepare('UPDATE x_fingerprints SET candidate_metadata_json=? WHERE url=?').run(JSON.stringify({leftImageUrl:'a',rightImageUrl:'b',origin:'candidate_generation',distance:2}),'a');
  concurrentState=groupState(sqlite);
 });
 const response=await sendX(racingDB,input({action:'merge',left:'a',right:'b',groupRevision:0}));assert.equal(response.status,409);assert.deepEqual(groupState(sqlite),concurrentState);assert.equal(events(sqlite).length,0);
});

test('near-photo candidates explain pending display state while automatic reset remains a no-op',async t=>{
 const {sqlite,DB}=setup(t);post(sqlite,'x:1',['a']);post(sqlite,'x:2',['b']);sqlite.exec("UPDATE posts SET data=json_remove(data,'$.moderationReason'); INSERT INTO x_fingerprints(url,hash,near_url) VALUES('a','ha','b'),('b','hb',NULL)");
 const current=await (await handleXReview(new Request('https://test.local/api/admin/x?status=all'),{DB},actor)).json();assert.equal(current.items.find(p=>p.id==='x:1').reviewState,'pending');
 const noOp=await sendX(DB,input({id:'x:1',decision:'auto',revision:0}));assert.equal(noOp.status,200);assert.equal((await noOp.json()).changed,false);assert.equal(events(sqlite).length,0);
 assert.equal((await sendX(DB,input({id:'x:1',decision:'visible',revision:0}))).status,200);const row=events(sqlite)[0],metadata=JSON.parse(row.metadata_json);assert.equal(JSON.parse(row.previous_state).decision,'auto');assert.equal(metadata.displayState,'pending');assert.ok(metadata.reviewReasons.length>0);
});

test('oversized complete group snapshots fail before any mutation instead of truncating history',async t=>{
 const {sqlite,DB}=setup(t);post(sqlite,'x:1',['a']);post(sqlite,'x:2',['b']);sqlite.exec("INSERT INTO x_fingerprints(url,hash,confirmed_hash) VALUES('a','ha','group-a'),('b','hb','group-b')");
 const insert=sqlite.prepare('INSERT INTO x_fingerprints(url,hash,confirmed_hash) VALUES(?,?,?)');for(let i=0;i<300;i++)insert.run('https://pbs.twimg.com/media/'+i+'x'.repeat(800),'h'+i,'group-a');
 const before=groupState(sqlite);const response=await sendX(DB,input({action:'merge',left:'a',right:'b',groupRevision:0}));assert.equal(response.status,413);assert.deepEqual(groupState(sqlite),before);assert.equal(events(sqlite).length,0);
});
