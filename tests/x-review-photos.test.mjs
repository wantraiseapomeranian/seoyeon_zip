import test from 'node:test';
import assert from 'node:assert/strict';
import {indexReviewPhotos} from '../src/x-review-photos.mjs';
const key=(a,b)=>JSON.stringify([a,b].sort());
function original(photos,rejected,id){const excluded=new Set(rejected.map(r=>key(r.left_url,r.right_url)));const pairs=[];for(const a of photos)if(a.id===id)for(const b of photos){if(b.id===a.id||(a.hash!==b.hash&&excluded.has(key(a.image,b.image)))||!((a.hash&&a.hash===b.hash)||a.near_url===b.image||b.near_url===a.image))continue;pairs.push([a,b]);}return pairs;}
test('indexed pairs preserve original order and decisions including reverse near links and repeated media',()=>{
 const photos=Array.from({length:80},(_,i)=>({id:'p'+(i%31),image:'u'+(i%57),hash:i%9===0?'':('h'+(i%19)),near_url:i%3===0?'u'+((i+1)%57):null}));
 photos.push({...photos[0]}, {id:'outside',image:'u200',hash:'h200',near_url:'u1'});
 const rejected=[{left_url:'u0',right_url:'u1'},{left_url:'u4',right_url:'u3'},{left_url:'u0',right_url:'u19'}];
 const index=indexReviewPhotos(photos,rejected);
 for(const id of new Set(photos.map(p=>p.id))){const expected=original(photos,rejected,id);assert.deepEqual(index.pairsFor(id),expected);assert.equal(index.pending.has(id),expected.some(([a,b])=>a.hash!==b.hash));}
 assert.deepEqual(index.pairsFor('missing'),[]);
});
test('large exact groups do not expand all pairs during classification',()=>{
 let reads=0;const photos=Array.from({length:6000},(_,i)=>({id:'p'+i,image:'u'+i,get hash(){reads++;return 'same';},near_url:null}));
 const index=indexReviewPhotos(photos,[]);assert.equal(index.pending.size,0);assert.ok(reads<6000*10,`classification read hash ${reads} times`);
 assert.equal(index.pairsFor('p0').length,5999);assert.ok(reads<6000*20);
});
