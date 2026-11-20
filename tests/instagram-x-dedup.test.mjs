import test from 'node:test';
import assert from 'node:assert/strict';
import jpeg from 'jpeg-js';
import {testDatabase} from './helpers/d1.mjs';
import {readFeed} from '../src/feed.mjs';
import {maintainX,instagramDhash} from '../src/x-maintenance.mjs';
import {handleInstagramReview} from '../src/instagram-review.mjs';

// Smooth synthetic pictures: the same pattern at another size and quality stands in for a re-encoded copy.
const picture=(width,height,fx,fy,quality=85)=>{
 const data=Buffer.alloc(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const v=128+110*Math.sin(x/width*fx)*Math.cos(y/height*fy),i=(y*width+x)*4;data[i]=data[i+1]=data[i+2]=v;data[i+3]=255;}
 return jpeg.encode({data,width,height},quality).data;
};
const xUrl='https://pbs.twimg.com/media/x.jpg',ig=name=>`https://a.cdninstagram.com/v/${name}.jpg?oh=1`;
// A large photo: only the Images binding's shrink keeps it within the decoder's limit.
const sameOnX=picture(340,425,9,7,80),sameOnInstagram=picture(720,900,9,7,92),other=picture(2000,2500,23,3);
// Stands in for the Images binding: a nearest-neighbour shrink into the requested box, re-encoded as JPEG.
const shrink=bytes=>{const s=jpeg.decode(bytes,{useTArray:true,maxResolutionInMP:25});const k=Math.min(1,680/Math.max(s.width,s.height)),width=Math.round(s.width*k),height=Math.round(s.height*k),data=Buffer.alloc(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(Math.min(s.height-1,Math.floor(y/k))*s.width+Math.min(s.width-1,Math.floor(x/k)))*4;data.set(s.data.subarray(i,i+4),(y*width+x)*4);}
 return jpeg.encode({data,width,height},85).data;};
function fakeImages(convert=shrink){const calls=[];return {calls,input(stream){const call={};calls.push(call);return {transform(o){call.transform=o;return this;},async output(o){call.output=o;const body=convert(new Uint8Array(await new Response(stream).arrayBuffer()));return {response:()=>new Response(body)};}};}};}
const env=(d,IMAGES=fakeImages())=>({DB:d.DB,COLLECTION_ENABLED:'true',IMAGES});
function setup({x=true,images=[ig('same'),ig('other')]}={}){
 const d=testDatabase();d.enable();
 if(x)addX(d);
 if(images.length)d.sqlite.prepare('INSERT INTO instagram_review(code,data,status,imported_at) VALUES(?,?,?,?)').run('Kept_123',JSON.stringify({author:'ig.author',url:'https://www.instagram.com/p/Kept_123/',publishedAt:'2026-09-10T00:00:00.000Z',images,media:images.map(previewUrl=>({kind:'image',previewUrl}))}),'kept','2026-09-10');
 return d;
}
const addX=d=>d.sqlite.prepare('INSERT INTO posts VALUES (?,?)').run('x:1',JSON.stringify({id:'x:1',platformPostId:'1',authorHandle:'first',canonicalUrl:'https://x.com/first/status/1',publishedAt:'2026-09-10T00:00:00.000Z',media:[{kind:'image',previewUrl:xUrl}]}));
async function withFetch(files,work){
 const original=globalThis.fetch,calls=[];
 globalThis.fetch=async address=>{const u=new URL(address);calls.push(u.href);
  if(u.hostname==='api.fxtwitter.com')return new Response(null,{status:500});
  const body=typeof files==='function'?await files(u):files[u.origin+u.pathname];
  return body?new Response(body):new Response(null,{status:403});};
 try{return await work(calls);}finally{globalThis.fetch=original;}
}
const files={'https://pbs.twimg.com/media/x.jpg':sameOnX,'https://a.cdninstagram.com/v/same.jpg':sameOnInstagram,'https://a.cdninstagram.com/v/other.jpg':other};
const row=(d,url)=>d.sqlite.prepare('SELECT * FROM x_fingerprints WHERE url=?').get(url);
const runs=async(d,n,images)=>{for(let i=0;i<n;i++)await maintainX(env(d,images));};

test('an Instagram photo auto-matched to an X photo leaves the feed while other photos and other confirmed hashes stay',async()=>{
 const d=setup({images:[ig('same'),ig('other'),ig('reviewed')]});try{
  d.sqlite.exec(`INSERT INTO x_fingerprints(url,hash) VALUES('${xUrl}','hx'),('${ig('other')}','ho');INSERT INTO x_fingerprints(url,hash,confirmed_hash,candidate_metadata_json) VALUES('${ig('same')}','hi','hx','{"origin":"instagram_auto_match"}'),('${ig('reviewed')}','hr','hx',NULL)`);
  const feed=await readFeed(d.DB,new URLSearchParams()),post=feed.posts.find(p=>p.platform==='instagram');
  assert.deepEqual(post.media.map(m=>m.previewUrl),[ig('other'),ig('reviewed')]);
  assert.ok(feed.posts.find(p=>p.id==='x:1').duplicateSources.some(p=>p.url.includes('instagram.com')));
 }finally{d.sqlite.close();}
});
test('maintenance hides a re-encoded Instagram copy of an existing X photo and keeps a different photo',async()=>{
 const d=setup();try{
  await withFetch(files,()=>runs(d,6));
  const x=row(d,xUrl),same=row(d,ig('same')),different=row(d,ig('other'));
  assert.ok(x.dhash);assert.equal(x.near_url,null);
  assert.ok(same.dhash);assert.equal(same.confirmed_hash,x.hash);assert.equal(same.near_url,null);assert.equal(same.error,null);
  const evidence=JSON.parse(same.candidate_metadata_json);assert.equal(evidence.origin,'instagram_auto_match');assert.equal(evidence.rightImageUrl,xUrl);assert.equal(evidence.threshold,7);assert.ok(evidence.distance<=7);
  assert.ok(different.dhash);assert.ok(Math.max(different.width,different.height)<=680);assert.equal(different.confirmed_hash,null);
  const post=(await readFeed(d.DB,new URLSearchParams())).posts.find(p=>p.platform==='instagram');
  assert.equal(post.media.length,1);assert.match(post.media[0].previewUrl,/other/);
 }finally{d.sqlite.close();}
});
test('an X photo collected after its Instagram copy still hides the copy and never takes it as an X candidate',async()=>{
 const d=setup({x:false});try{
  await withFetch(files,async()=>{await runs(d,4);assert.ok(row(d,ig('same')).dhash);assert.equal(row(d,ig('same')).confirmed_hash,null);addX(d);await runs(d,2);});
  const x=row(d,xUrl);assert.equal(row(d,ig('same')).confirmed_hash,x.hash);assert.equal(row(d,ig('other')).confirmed_hash,null);assert.equal(x.near_url,null);
 }finally{d.sqlite.close();}
});
// Production 2026-11-18: an Instagram copy tied (distance 4) between a hand-hidden X post and a shown one, took the hidden one and stayed in the feed.
const addHiddenX=(d,url)=>{d.sqlite.prepare('INSERT INTO posts VALUES (?,?)').run('x:2',JSON.stringify({id:'x:2',platformPostId:'2',authorHandle:'second',canonicalUrl:'https://x.com/second/status/2',publishedAt:'2026-09-10T00:00:00.000Z',media:[{kind:'image',previewUrl:url}]}));d.sqlite.prepare("INSERT INTO x_quality(post_id,decision) VALUES('x:2','hidden')").run();};
test('an Instagram copy is matched only to an X photo the feed shows, even when a hidden post holds an equally close one',async()=>{
 const hiddenUrl='https://pbs.twimg.com/media/hidden.jpg',d=setup({x:false,images:[ig('same')]});try{
  const fp=await withFetch(files,()=>instagramDhash(ig('same'),fakeImages()));
  addHiddenX(d,hiddenUrl);addX(d);
  const insert=d.sqlite.prepare('INSERT INTO x_fingerprints(url,hash,dhash,width,height) VALUES(?,?,?,?,?)');
  insert.run(hiddenUrl,'hidden',fp.dhash,fp.width,fp.height);insert.run(xUrl,'shown',fp.dhash,fp.width,fp.height);insert.run(ig('same'),'stored',null,null,null);
  await withFetch(files,()=>runs(d,2));
  assert.equal(row(d,ig('same')).confirmed_hash,'shown');
  assert.ok(!(await readFeed(d.DB,new URLSearchParams())).posts.some(p=>p.platform==='instagram'));
 }finally{d.sqlite.close();}
});
test('an X photo arriving in a hidden post leaves a waiting Instagram copy unmatched',async()=>{
 const d=setup({x:false,images:[ig('same')]});try{
  await withFetch(files,async()=>{await runs(d,3);assert.ok(row(d,ig('same')).dhash);addHiddenX(d,xUrl);await runs(d,2);});
  assert.ok(row(d,xUrl).dhash);assert.equal(row(d,ig('same')).confirmed_hash,null);
 }finally{d.sqlite.close();}
});
test('a photo that cannot be compared is marked once; a refused address or failed transformation is retried a day later',async()=>{
 for(const [name,body,images,error] of [['refused',null,undefined,'perceptual_retry'],['allowance',sameOnInstagram,fakeImages(()=>{throw Error('9422');}),'perceptual_retry'],['broken',sameOnInstagram,fakeImages(()=>Buffer.from('not a jpeg')),'perceptual_failed']]){
  const d=setup({x:false,images:[ig(name)]});try{
   d.sqlite.prepare("INSERT INTO x_fingerprints(url,hash) VALUES(?,'stored')").run(ig(name));
   await withFetch(()=>body,async calls=>{await runs(d,3,images);assert.equal(calls.filter(u=>u.includes('cdninstagram')).length,1,name);});
   const state=row(d,ig(name));assert.equal(state.error,error,name);assert.equal(state.dhash,null);assert.equal(state.hash,'stored');
   d.sqlite.prepare('UPDATE x_fingerprints SET next_check=0 WHERE url=?').run(ig(name));
   const retried=name!=='broken';
   await withFetch(()=>sameOnInstagram,async calls=>{await runs(d,1);assert.equal(calls.filter(u=>u.includes('cdninstagram')).length,retried?1:0,name);});
   if(retried){const renewed=row(d,ig(name));assert.equal(renewed.error,null);assert.ok(renewed.dhash);}
  }finally{d.sqlite.close();}
 }
});
test('an address past its expiry is never fetched, so the next live photo is compared instead',async()=>{
 const at=s=>Math.floor(Date.now()/1000+s).toString(16),expired=ig('same')+'&oe='+at(-3600),live=ig('other')+'&oe='+at(86400);
 const d=setup({images:[expired,live]});try{
  d.sqlite.prepare("INSERT INTO x_fingerprints(url,hash) VALUES(?,'stored'),(?,'stored')").run(expired,live);
  await withFetch(files,async calls=>{await runs(d,4);assert.ok(!calls.some(u=>u.includes('/v/same.jpg')));});
  assert.ok(row(d,live).dhash);const skipped=row(d,expired);assert.equal(skipped.dhash,null);assert.equal(skipped.error,null);
 }finally{d.sqlite.close();}
});
test('the comparison reads the display alias, keeps the stored byte hash and is marked before decoding',async()=>{
 const d=setup({images:[ig('same')]});try{
  d.sqlite.prepare("INSERT INTO x_fingerprints(url,hash) VALUES(?,'stored')").run(ig('same'));
  d.sqlite.prepare('INSERT INTO instagram_preview_urls(code,source_url,preview_url,updated_at) VALUES(?,?,?,0)').run('Kept_123',ig('same'),ig('alias'));
  let marker;const images=fakeImages();
  await withFetch(u=>{if(u.hostname==='pbs.twimg.com')return sameOnX;if(u.pathname==='/v/alias.jpg'){marker=row(d,ig('same')).error;return sameOnInstagram;}return null;},()=>runs(d,3,images));
  assert.equal(marker,'perceptual_pending');
  assert.deepEqual(images.calls,[{transform:{width:680,height:680,fit:'scale-down'},output:{format:'image/jpeg'}}]);
  const state=row(d,ig('same'));assert.equal(state.hash,'stored');assert.equal(state.confirmed_hash,row(d,xUrl).hash);assert.equal(state.error,null);
 }finally{d.sqlite.close();}
});
test('a photo awaiting review is compared with X first, the review card names the match, and keeping the post hides that photo at once',async()=>{
 const d=setup({images:[]});try{
  d.sqlite.prepare('INSERT INTO instagram_review(code,data,status,imported_at) VALUES(?,?,?,?)').run('Pend_123',JSON.stringify({author:'ig.author',url:'https://www.instagram.com/p/Pend_123/',images:[ig('same'),ig('other'),ig('clip')],media:[{kind:'image',previewUrl:ig('same')},{kind:'image',previewUrl:ig('other')},{kind:'video',previewUrl:ig('clip')}]}),'pending','2026-09-10');
  const review=async()=>(await (await handleInstagramReview(new Request('https://example.test/api/admin/instagram?status=all'),{DB:d.DB})).json()).items[0].xComparison;
  assert.deepEqual(await review(),{photos:2,compared:0,waiting:2,failed:0,matches:[]});
  await withFetch(files,()=>runs(d,6));
  const x=row(d,xUrl),{matches,...counts}=await review();
  assert.equal(row(d,ig('same')).confirmed_hash,x.hash);assert.equal(row(d,ig('clip')).dhash,null);
  assert.deepEqual(counts,{photos:2,compared:2,waiting:0,failed:0});
  assert.equal(matches.length,1);assert.ok(matches[0].distance<=7);
  assert.deepEqual({...matches[0],distance:0},{position:0,image:xUrl,url:'https://x.com/first/status/1',author:'first',publishedAt:'2026-09-10T00:00:00.000Z',distance:0,shown:true});
  assert.ok(!(await readFeed(d.DB,new URLSearchParams())).posts.some(p=>p.platform==='instagram'));
  d.sqlite.exec("UPDATE instagram_review SET status='kept'");
  const post=(await readFeed(d.DB,new URLSearchParams())).posts.find(p=>p.platform==='instagram');
  assert.deepEqual(post.media.map(m=>m.previewUrl),[ig('other'),ig('clip')]);
 }finally{d.sqlite.close();}
});
