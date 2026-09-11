import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { normalizePage, matchesSeoyeon } from '../src/collection.mjs';
import { openStore, savePage } from '../src/store.mjs';

const source = { handle: 'Seowoo_0501', verifiedDirect: true };
const post = (id, changes = {}) => ({ type: 'status', id: String(id), url: `https://x.com/Seowoo_0501/status/${id}`, author: { screen_name: source.handle }, reposted_by:null, text: '', created_at: '2026-09-09T00:00:00Z', media: { all: [{ type: 'photo', url: 'https://pbs.twimg.com/media/example.jpg', width: 100, height: 150 }] }, ...changes });
const page = (posts, cursor = 'next') => normalizePage({ code: 200, results: posts, cursor: { bottom: cursor } }, source);

test('Jiyeon hashtag is not Seoyeon; names require Unicode token boundaries', () => {
  assert.equal(matchesSeoyeon('#JiYeon #지연 #지서연 #ジヨン'), false);
  assert.equal(matchesSeoyeon('#윤서연 #SeoYeon'), true);
  assert.equal(matchesSeoyeon('w/ Seoyeon'), true);
  assert.equal(matchesSeoyeon('#서연'), true);
  assert.equal(matchesSeoyeon('S10'), false);
});

test('verified direct exception excludes nameless reposts and quotes', () => {
  assert.equal(page([post(1)]).posts.length, 1);
  assert.equal(page([post(2, { author: { screen_name: 'other' }, url: 'https://x.com/other/status/2' })]).posts.length, 0);
  assert.equal(page([post(3, { quote: { text: '윤서연' } })]).posts.length, 0);
  assert.equal(page([post(7, { reposted_by:undefined })]).posts.length, 0);
  assert.equal(page([post(8, { reposted_by:{screen_name:source.handle} })]).posts.length, 0);
  assert.equal(page([post(4, { text: 'S10' })]).posts.length, 1);
  assert.equal(normalizePage({code:200, results:[post(5,{text:'S10'})],cursor:{bottom:null}}, {handle: source.handle, verifiedDirect:false}).posts.length,0);
  const repost = page([post(6, { author: { screen_name: 'other' }, url: 'https://x.com/other/status/6', text: '윤서연' })]).posts[0];
  assert.equal(repost.authorHandle, 'other');
  assert.equal(repost.observedViaSource, source.handle);
  assert.equal(repost.relationship, 'repost');
});

test('malformed last item rejects the full page and unsafe URLs are rejected', () => {
  assert.throws(() => page([post(1), post(2, { id: 2 })]));
  assert.throws(() => page([post(1, { url: 'https://x.com.evil.test/Seowoo_0501/status/1' })]));
  assert.throws(() => page([post(1, { media: {all:[{type:'photo',url:'http://127.0.0.1/private'}]} })]));
});

test('21-item page persists fully; stale writer cannot advance cursor', () => {
  const db = openStore(':memory:');
  const p = page(Array.from({length:21}, (_,i)=>post(i+1)));
  savePage(db, source.handle, p, 0);
  assert.equal(db.prepare('SELECT count(*) n FROM posts').get().n, 21);
  assert.equal(db.prepare('SELECT count(*) n FROM media').get().n, 21);
  assert.equal(db.prepare('SELECT cursor FROM source_state').get().cursor, 'next');
  assert.throws(() => savePage(db, source.handle, page([post(22)], 'bad'), 0), /stale/);
  assert.equal(db.prepare('SELECT count(*) n FROM posts').get().n, 21);
  db.close();
});

test('failure during media write rolls back posts, discovery and cursor', () => {
  const db = openStore(':memory:');
  savePage(db, source.handle, page([post(1)], 'old'), 0);
  db.exec("CREATE TRIGGER fail_media BEFORE INSERT ON media WHEN NEW.post_id='x:2' BEGIN SELECT RAISE(ABORT,'injected failure'); END;");
  assert.throws(() => savePage(db, source.handle, page([post(2)],'new'), 1), /injected failure/);
  assert.equal(db.prepare('SELECT count(*) n FROM posts').get().n,1);
  assert.equal(db.prepare('SELECT cursor FROM source_state').get().cursor,'old');
  assert.equal(db.prepare('SELECT revision FROM source_state').get().revision,1);
  db.close();
});

test('separate process replay after reopening database creates no duplicates', () => {
  const path = join(mkdtempSync(join(tmpdir(),'seoyeon-test-')), 'test.sqlite');
  const p = page(Array.from({length:21}, (_,i)=>post(i+1)));
  const db = openStore(path); savePage(db,source.handle,p,0); db.close();
  const script = `import {openStore,savePage} from ${JSON.stringify(new URL('../src/store.mjs',import.meta.url).href)}; const db=openStore(${JSON.stringify(path)});savePage(db,${JSON.stringify(source.handle)},${JSON.stringify(p)},1);db.close();`;
  const result=spawnSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  const reopened=openStore(path);
  assert.equal(reopened.prepare('SELECT count(*) n FROM posts').get().n,21);
  assert.equal(reopened.prepare('SELECT count(*) n FROM media').get().n,21);
  assert.equal(reopened.prepare('SELECT count(*) n FROM discoveries').get().n,21);
  reopened.close();
});

test('secondary sources require names and recognize Korean COSMO labels',()=>{
 const secondary={handle:'S2O806',verifiedDirect:false};
 const normalize=text=>normalizePage({code:200,results:[post(99,{author:{screen_name:'S2O806'},url:'https://x.com/S2O806/status/99',text})],cursor:{bottom:null}},secondary).posts;
 assert.equal(normalize('260904 코스모톡 #윤서연')[0].contentKind,'cosmo');
 assert.equal(normalize('코스모 #서연')[0].contentKind,'cosmo');
 assert.equal(normalize('COSMO #SeoYeon')[0].contentKind,'cosmo');
 assert.equal(normalize('코스모톡').length,0);
 assert.equal(normalize('cosmopolitan #윤서연')[0].contentKind,'other');
});

test('secondary configuration never grants nameless direct-post exception',async()=>{
 const {sources}=await import('../src/sources.mjs');
 for(const handle of ['sogeumdwarf','hamhamm806','S2O806'])assert.equal(sources.find(s=>s.handle===handle).verifiedDirect,false);
});

test('duplicate IDs do not skip validation of later occurrences',()=>{
 assert.throws(()=>page([post(1),post(1,{media:{all:[{type:'photo',url:'http://127.0.0.1/private'}]}})]));
 const p=page([post(1),post(1,{media:{all:[{type:'photo',url:'https://pbs.twimg.com/media/updated.jpg'},{type:'photo',url:'https://pbs.twimg.com/media/second.jpg'}]}})]);
 assert.equal(p.receivedCount,2);assert.equal(p.posts.length,1);assert.equal(p.posts[0].media.length,2);
});
