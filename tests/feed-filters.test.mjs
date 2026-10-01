import test from 'node:test';
import assert from 'node:assert/strict';
import {testDatabase} from './helpers/d1.mjs';
import {readFeed} from '../src/feed.mjs';
import {normalize,importInstagram} from '../src/instagram-import.mjs';

const query=(DB,p={})=>readFeed(DB,new URLSearchParams({media:'image',...p}));
const x=(sqlite,id,author,extra={})=>{
 const p={id:'x:'+id,authorHandle:author,observedViaSource:'collector',publishedAt:'2026-09-22T00:00:00Z',contentKind:'fansite',media:[{kind:'image'}],...extra};
 sqlite.prepare('INSERT INTO posts VALUES(?,?)').run(p.id,JSON.stringify(p));return p;
};
const ig=(sqlite,code,author,extra={},status='kept')=>sqlite.prepare('INSERT INTO instagram_review(code,data,status,imported_at) VALUES(?,?,?,?)').run(code,JSON.stringify({author,caption:'',url:'https://www.instagram.com/p/'+code+'/',publishedAt:'2026-09-22T00:00:00Z',images:['https://s.cdninstagram.com/'+code+'.jpg'],media:[{kind:'image'}],...extra}),status,'2026-09-22T00:00:00Z');

test('platform and actual author filter automatic, reposted and manually added posts',async t=>{
 const {DB,sqlite}=testDatabase();t.after(()=>sqlite.close());
 x(sqlite,1,'writer');x(sqlite,2,'collector');
 sqlite.exec("INSERT INTO discoveries VALUES('x:1','collector')");
 ig(sqlite,'insta1','writer');
 const manual={id:'manual:x:3',platform:'x',authorHandle:'writer',observedViaSource:'manual',manual:true,publishedAt:'2026-09-21T00:00:00Z',contentKind:'other',media:[{kind:'image'}]};
 sqlite.prepare('INSERT INTO manual_posts(id,canonical_url,data,created_at) VALUES(?,?,?,?)').run(manual.id,'https://x.com/writer/status/3',JSON.stringify(manual),manual.publishedAt);
 assert.equal((await query(DB,{platform:'x'})).total,3);
 assert.deepEqual((await query(DB,{author:'x:WRITER'})).posts.map(p=>p.id),['x:1','manual:x:3']);
 assert.deepEqual((await query(DB,{platform:'instagram',author:'instagram:writer'})).posts.map(p=>p.id),['ig:insta1']);
 assert.deepEqual((await query(DB,{author:'x:collector'})).posts.map(p=>p.id),['x:2']);
 assert.deepEqual((await query(DB,{source:'collector'})).posts.map(p=>p.id),['x:1'],'old API source remains a discovery filter');
});

test('author options use the entire visible platform, including authors beyond page one but excluding moderation-hidden data',async t=>{
 const {DB,sqlite}=testDatabase();t.after(()=>sqlite.close());
 for(let n=1;n<=50;n++)x(sqlite,n,n===50?'late_author':'FirstAuthor');
 x(sqlite,90,'hidden');sqlite.exec("INSERT INTO x_quality(post_id,decision,availability) VALUES('x:90','hidden','unknown')");
 ig(sqlite,'insta1','dot.name',{contentKind:'cosmo'});ig(sqlite,'insta2','pending.name',{},'pending');
 const result=await query(DB,{platform:'x'});
 assert.equal(result.posts.length,48);assert.ok(result.authors.some(a=>a.value==='x:late_author'));
 assert.deepEqual(result.authors.map(a=>a.value).sort(),['x:firstauthor','x:late_author']);
 const empty=await query(DB,{platform:'instagram',date:'2000-01-01'});
 assert.equal(empty.total,0);assert.deepEqual(empty.authors,[{value:'instagram:dot.name',platform:'instagram',handle:'dot.name'}]);
 assert.equal((await query(DB,{platform:'instagram',kind:'cosmo'})).total,1);
});

test('platform and author are included in cursor scope; invalid or contradictory filters are rejected',async t=>{
 const {DB,sqlite}=testDatabase();t.after(()=>sqlite.close());
 for(let n=1;n<=52;n++)x(sqlite,n,'writer');
 const first=await query(DB,{platform:'x',author:'x:writer'});
 const next=await query(DB,{platform:'x',author:'x:WRITER',cursor:first.nextCursor});
 assert.equal(next.posts.length,4);assert.equal(new Set([...first.posts,...next.posts].map(p=>p.id)).size,52);
 for(const p of [{platform:'bad'},{author:'x:a.b'},{author:'instagram:bad/name'},{platform:'x',author:'instagram:writer'},{media:'youtube',platform:'x'},{media:'youtube',author:'x:writer'},{cursor:first.nextCursor,author:'x:other'},{cursor:first.nextCursor,author:'x:writer'}])await assert.rejects(query(DB,p),/invalid_feed_query/);
});

test('Instagram kinds use explicit content evidence and do not infer official status from mentions',async t=>{
 for(const [caption,author,kind] of [
  ['260829 Cosmo Talk #윤서연','fan','cosmo'],['#코스모톡','fan','cosmo'],['#직찍 윤서연','fan','fansite'],
  ['Photo by _ @cheocjf','cheocjf','fansite'],['Photo by @another','fan','other'],
  ['Photo by @photographer2','photographer','other'],['@triplescosmos 공식 사진 모음','fan','other'],['cosmopolitan','fan','other']
 ])assert.equal(normalize({shortCode:'valid1',caption,ownerUsername:author}).contentKind,kind,caption);
 const {DB,sqlite}=testDatabase();t.after(()=>sqlite.close());
 await importInstagram(DB,[{shortCode:'valid1',caption:'COSMO Talk',ownerUsername:'fan'}]);
 await importInstagram(DB,[{shortCode:'valid1',displayUrl:'https://s.cdninstagram.com/a.jpg'}]);
 const row=JSON.parse(sqlite.prepare("SELECT data FROM instagram_review WHERE code='valid1'").get().data);
 assert.equal(row.contentKind,'cosmo','partial refresh retains the final merged caption classification');
});
