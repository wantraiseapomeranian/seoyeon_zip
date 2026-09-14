const pairKey=(a,b)=>JSON.stringify([a,b].sort());
const add=(map,key,index)=>{const list=map.get(key);if(list)list.push(index);else map.set(key,[index]);};

// Index stored relationships; never rediscover similarity with an all-photo cross product.
export function indexReviewPhotos(photos,rejected){
 const byPost=new Map(),byImage=new Map(),byHash=new Map(),byNear=new Map();
 const excluded=new Set(rejected.map(r=>pairKey(r.left_url,r.right_url)));
 photos.forEach((p,i)=>{add(byPost,p.id,i);add(byImage,p.image,i);if(p.hash)add(byHash,p.hash,i);if(p.near_url!=null)add(byNear,p.near_url,i);});
 const pending=new Set();
 // Only unresolved near relationships affect review state. Exact groups need no expansion.
 for(const a of photos){if(a.near_url==null)continue;for(const i of byImage.get(a.near_url)??[]){const b=photos[i];if(a.id!==b.id&&a.hash!==b.hash&&!excluded.has(pairKey(a.image,b.image))){pending.add(a.id);pending.add(b.id);}}}
 function pairsFor(id){
  const pairs=[];
  for(const i of byPost.get(id)??[]){const a=photos[i];const candidates=new Set([...(a.hash?byHash.get(a.hash)??[]:[]),...(byImage.get(a.near_url)??[]),...(byNear.get(a.image)??[])]);
   // Match the old database/media order, including repeated media rows.
   for(const j of [...candidates].sort((a,b)=>a-b)){const b=photos[j];if(a.id===b.id||(a.hash!==b.hash&&excluded.has(pairKey(a.image,b.image))))continue;pairs.push([a,b]);}
  }
  return pairs;
 }
 return {pending,pairsFor};
}
