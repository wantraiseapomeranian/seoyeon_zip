import test from 'node:test';
import assert from 'node:assert/strict';
import jpeg from 'jpeg-js';
import {testDatabase} from './helpers/d1.mjs';
import {readFeed} from '../src/feed.mjs';
import {maintainX} from '../src/x-maintenance.mjs';

// Smooth synthetic pictures: the same pattern at another size and quality stands in for a re-encoded copy.
const picture=(width,height,fx,fy,quality=85)=>{
 const data=Buffer.alloc(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const v=128+110*Math.sin(x/width*fx)*Math.cos(y/height*fy),i=(y*width+x)*4;data[i]=data[i+1]=data[i+2]=v;data[i+3]=255;}
 return jpeg.encode({data,width,height},quality).data;
};
const xUrl='https://pbs.twimg.com/media/x.jpg',ig=name=>`https://a.cdninstagram.com/v/${name}.jpg?oh=1`;
const sameOnX=picture(340,425,9,7,80),sameOnInstagram=picture(720,900,9,7,92),other=picture(720,900,23,3);
const env=d=>({DB:d.DB,COLLECTION_ENABLED:'true'});
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
const runs=async(d,n)=>{for(let i=0;i<n;i++)await maintainX(env(d));};

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
  const evidence=JSON.parse(same.candidate_metadata_json);assert.equal(evidence.origin,'instagram_auto_match');assert.equal(evidence.rightImageUrl,xUrl);assert.equal(evidence.threshold,5);assert.ok(evidence.distance<=5);
  assert.ok(different.dhash);assert.equal(different.confirmed_hash,null);
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
test('a photo that cannot be compared is marked once; only an expired address is retried a day later',async()=>{
 for(const [name,body,error] of [['expired',null,'perceptual_retry'],['huge',picture(2000,1600,9,7,60),'perceptual_failed'],['webp',Buffer.from('RIFF0000WEBPVP8 '),'perceptual_failed']]){
  const d=setup({x:false,images:[ig(name)]});try{
   d.sqlite.prepare("INSERT INTO x_fingerprints(url,hash) VALUES(?,'stored')").run(ig(name));
   await withFetch(()=>body,async calls=>{await runs(d,3);assert.equal(calls.filter(u=>u.includes('cdninstagram')).length,1,name);});
   const state=row(d,ig(name));assert.equal(state.error,error,name);assert.equal(state.dhash,null);assert.equal(state.hash,'stored');
   d.sqlite.prepare('UPDATE x_fingerprints SET next_check=0 WHERE url=?').run(ig(name));
   await withFetch(()=>name==='expired'?sameOnInstagram:body,async calls=>{await runs(d,1);assert.equal(calls.filter(u=>u.includes('cdninstagram')).length,name==='expired'?1:0,name);});
   if(name==='expired'){const renewed=row(d,ig(name));assert.equal(renewed.error,null);assert.ok(renewed.dhash);}
  }finally{d.sqlite.close();}
 }
});
test('the comparison reads the display alias, keeps the stored byte hash and is marked before decoding',async()=>{
 const d=setup({images:[ig('same')]});try{
  d.sqlite.prepare("INSERT INTO x_fingerprints(url,hash) VALUES(?,'stored')").run(ig('same'));
  d.sqlite.prepare('INSERT INTO instagram_preview_urls(code,source_url,preview_url,updated_at) VALUES(?,?,?,0)').run('Kept_123',ig('same'),ig('alias'));
  let marker;
  await withFetch(u=>{if(u.hostname==='pbs.twimg.com')return sameOnX;if(u.pathname==='/v/alias.jpg'){marker=row(d,ig('same')).error;return sameOnInstagram;}return null;},()=>runs(d,3));
  assert.equal(marker,'perceptual_pending');
  const state=row(d,ig('same'));assert.equal(state.hash,'stored');assert.equal(state.confirmed_hash,row(d,xUrl).hash);assert.equal(state.error,null);
 }finally{d.sqlite.close();}
});
