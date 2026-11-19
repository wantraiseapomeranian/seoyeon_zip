import jpeg from 'jpeg-js';
import {withProviderRetry,ProviderCooldownError} from './provider-retry.mjs';
import {decidePhotos} from './review-mutations.mjs';
export const hamming=(a,b)=>{let x=BigInt('0x'+a)^BigInt('0x'+b),n=0;while(x){x&=x-1n;n++;}return n;};
const instagramImage=u=>u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&/(^|\.)(cdninstagram\.com|fbcdn\.net)$/.test(u.hostname);
const twitterImage='https://pbs.twimg.com/';
// X photos are compared within 4 bits. Pairs within 2 bits are merged automatically: by hand (2026-09-12..11-19) 173 of 174 such pairs
// were the same photo (one distinct pair at 1 bit); 3-4 bits stay in the review queue. Instagram copies are hidden automatically within 7 bits:
// on production (2026-11-18, Cloudflare's 680px shrink) the 17 real copies were 0-5 and 7, and the closest different photo was 11 away.
const nearX=4,autoX=2,nearInstagram=7,ratioTolerance=.02;
function dhashOf({width,height,data}){
 const lum=(x,y)=>{const i=(Math.min(height-1,Math.floor(y*height/8))*width+Math.min(width-1,Math.floor(x*width/9)))*4;return data[i]*.299+data[i+1]*.587+data[i+2]*.114;};
 let dhash=0n;for(let y=0;y<8;y++)for(let x=0;x<8;x++)dhash=(dhash<<1n)|BigInt(lum(x,y)>lum(x+1,y));
 return dhash.toString(16).padStart(16,'0');
}
const closest=(candidates,fp,limit)=>{let best=null;for(const f of candidates){if(Math.abs(f.width/f.height-fp.width/fp.height)>=ratioTolerance)continue;const distance=hamming(f.dhash,fp.dhash);if(distance<=limit&&(!best||distance<best.distance))best={...f,distance};}return best;};
const matchEvidence=(instagram,x,distance)=>JSON.stringify({schemaVersion:1,origin:'instagram_auto_match',generatedAt:new Date().toISOString(),leftImageUrl:instagram.url,rightImageUrl:x.url,algorithm:'dhash',algorithmVersion:'dhash-luma-9x8-v1',hashBits:64,distance,threshold:nearInstagram,aspectRatioTolerance:ratioTolerance,leftWidth:instagram.width,leftHeight:instagram.height,rightWidth:x.width,rightHeight:x.height,leftDhash:instagram.dhash,rightDhash:x.dhash,rightHash:x.hash});
// Instagram's signed addresses cannot be resized, so the Images binding shrinks the photo to X's 680px "small" size before decoding:
// large and WebP photos are compared too, and both sides are hashed at the same size.
export async function instagramDhash(url,images){
 const u=new URL(url);if(!instagramImage(u))throw Error('unsupported_image');
 const response=await fetch(u,{redirect:'manual',signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('image_http_'+response.status);
 let small;try{small=(await images.input(response.body).transform({width:680,height:680,fit:'scale-down'}).output({format:'image/jpeg'})).response();}
 catch(error){console.log(JSON.stringify({event:'instagram_image_transform',status:'failed',message:String(error?.message).slice(0,200)}));throw Error('image_transform_failed');}
 const decoded=jpeg.decode(await limitedBody(small,2_000_000),{useTArray:true,maxResolutionInMP:1,maxMemoryUsageInMB:32,tolerantDecoding:false});
 return {dhash:dhashOf(decoded),width:decoded.width,height:decoded.height};
}
export async function fingerprint(url){
 const u=new URL(url);const instagram=instagramImage(u);if(!instagram&&(u.origin!=='https://pbs.twimg.com'||!u.pathname.startsWith('/media/')))throw Error('unsupported_image');
 if(!instagram)u.searchParams.set('name','orig');
 const original=await fetch(u,{redirect:'manual',signal:AbortSignal.timeout(15000)});
 if(!original.ok)throw Error('original_http_'+original.status);
 const originalBytes=await limitedBody(original,10_000_000);
 const sha=await crypto.subtle.digest('SHA-256',originalBytes);
 const hash=Array.from(new Uint8Array(sha),b=>b.toString(16).padStart(2,'0')).join('');
 if(instagram)return {hash,dhash:null,width:null,height:null,version:2};
 u.searchParams.set('format','jpg');u.searchParams.set('name','small');
 const response=await fetch(u,{redirect:'manual',signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('image_http_'+response.status);
 const bytes=await limitedBody(response,2_000_000);
 const decoded=jpeg.decode(bytes,{useTArray:true,maxResolutionInMP:1,maxMemoryUsageInMB:32,tolerantDecoding:false});
 return {hash,dhash:dhashOf(decoded),width:decoded.width,height:decoded.height,version:2};
}
async function limitedBody(response,limit){
 const chunks=[];let size=0;const reader=response.body.getReader();
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw Error('oversized_response');}chunks.push(value);}
 const bytes=new Uint8Array(size);let n=0;for(const c of chunks){bytes.set(c,n);n+=c.length;}return bytes;
}
export async function checkOriginal(post,DB){
 return DB?withProviderRetry(DB,()=>rawCheckOriginal(post)):rawCheckOriginal(post);
}
async function rawCheckOriginal(post){
 const u=new URL(post.canonicalUrl);if(u.origin!=='https://x.com'||!/^\/[A-Za-z0-9_]{1,15}\/status\/\d+$/.test(u.pathname))throw Error('invalid_post');
 const response=await fetch('https://api.fxtwitter.com'+u.pathname,{headers:{'User-Agent':'SeoyeonZip/0.1 (+https://seoyeon-zip.seoyeon-archive.workers.dev)'},redirect:'manual',signal:AbortSignal.timeout(15000)});
 if(response.status===429){await response.body?.cancel();throw Object.assign(Error('rate_limited'),{status:429,retryAfter:response.headers.get('retry-after')});}
 if(response.status!==200&&response.status!==404){await response.body?.cancel();return 'retry';}
 const data=JSON.parse(new TextDecoder().decode(await limitedBody(response,1_000_000)));
 if(data.code===429)throw Object.assign(Error('rate_limited'),{status:429,retryAfter:response.headers.get('retry-after')});
 if(response.status===404&&data.code===404&&data.message==='NOT_FOUND'&&data.tweet===null)return 'missing';
 if(response.status===200&&data.code===200&&String(data.tweet?.id)===post.platformPostId)return 'available';
 return 'retry';
}
export async function maintainX(env){
 if(env.COLLECTION_ENABLED!=='true')return;
 const DB=env.DB,token=crypto.randomUUID();
 const lock=await DB.prepare('UPDATE x_maintenance SET token=?,until_at=unixepoch()+120 WHERE id=1 AND until_at<unixepoch() AND EXISTS(SELECT 1 FROM collection_control WHERE id=1 AND enabled=1) RETURNING (SELECT revision FROM collection_control WHERE id=1) AS revision').bind(token).first();
 if(!lock)return;
 const statements=[];
 try{
  const image=await DB.prepare("SELECT url FROM (SELECT DISTINCT m.value AS url,0 AS priority FROM instagram_review p,json_each(CASE WHEN COALESCE(json_array_length(p.data,'$.images'),0)>0 THEN json_extract(p.data,'$.images') ELSE json_array(json_extract(p.data,'$.image')) END) m WHERE p.status='kept' AND m.value IS NOT NULL UNION ALL SELECT DISTINCT json_extract(m.value,'$.previewUrl') AS url,1 AS priority FROM posts p,json_each(p.data,'$.media') m WHERE json_extract(m.value,'$.kind')='image' AND json_extract(m.value,'$.previewUrl') LIKE 'https://pbs.twimg.com/media/%') images LEFT JOIN x_fingerprints f USING(url) WHERE f.url IS NULL OR (f.hash IS NULL AND f.next_check<=unixepoch()) ORDER BY priority LIMIT 1").first();
  if(image){try{
   const fp=await fingerprint(image.url);const all=await DB.prepare('SELECT url,hash,confirmed_hash,dhash,width,height FROM x_fingerprints WHERE dhash IS NOT NULL AND hash!=?').bind(fp.hash).all();
   // Review candidates stay X-to-X; Instagram rows are only ever hidden against X.
   const near=fp.dhash&&all.results.find(f=>f.url.startsWith(twitterImage)&&Math.abs(f.width/f.height-fp.width/fp.height)<ratioTolerance&&hamming(f.dhash,fp.dhash)<=nearX);
   // An X photo collected after its Instagram copy: hide the copies that were waiting without a match, if the feed shows that X photo.
   const copies=fp.dhash?all.results.filter(copy=>!copy.url.startsWith(twitterImage)&&!copy.confirmed_hash).map(copy=>({copy,match:closest([copy],fp,nearInstagram)})).filter(c=>c.match):[];
   if(copies.length&&await DB.prepare("SELECT 1 FROM x_eligible p,json_each(p.data,'$.media') m WHERE json_extract(m.value,'$.previewUrl')=? LIMIT 1").bind(image.url).first())
    for(const {copy,match} of copies)statements.push(DB.prepare('UPDATE x_fingerprints SET confirmed_hash=?,candidate_metadata_json=? WHERE url=? AND confirmed_hash IS NULL').bind(fp.hash,matchEvidence(copy,{url:image.url,...fp},match.distance),copy.url));
   const evidence=near?JSON.stringify({schemaVersion:1,origin:'candidate_generation',generatedAt:new Date().toISOString(),leftImageUrl:image.url,rightImageUrl:near.url,algorithm:'dhash',algorithmVersion:'dhash-luma-9x8-v1',hashBits:64,sampleWidth:9,sampleHeight:8,distance:hamming(fp.dhash,near.dhash),threshold:nearX,aspectRatioTolerance:ratioTolerance,leftAspectRatio:fp.width/fp.height,rightAspectRatio:near.width/near.height,leftWidth:fp.width,leftHeight:fp.height,rightWidth:near.width,rightHeight:near.height,leftDhash:fp.dhash,rightDhash:near.dhash,leftHash:fp.hash,rightHash:near.hash}):null;
   statements.push(DB.prepare('INSERT INTO x_fingerprints(url,hash,dhash,width,height,near_url,candidate_metadata_json) VALUES(?,?,?,?,?,?,?) ON CONFLICT(url) DO UPDATE SET hash=excluded.hash,dhash=excluded.dhash,width=excluded.width,height=excluded.height,near_url=excluded.near_url,candidate_metadata_json=excluded.candidate_metadata_json,error=NULL').bind(image.url,fp.hash,fp.dhash,fp.width,fp.height,near?.url??null,evidence));
  }catch{statements.push(DB.prepare("INSERT INTO x_fingerprints(url,error,next_check) VALUES(?,'image_check_failed',unixepoch()+86400) ON CONFLICT(url) DO UPDATE SET error=excluded.error,next_check=excluded.next_check").bind(image.url));}}
  else{
   // With nothing new to hash, compare one kept Instagram photo against X. The display alias is fetched when the stored address has a newer rendition.
   // Instagram addresses carry their expiry (oe, hex seconds) and always answer 403 after it, so expired ones are not fetched:
   // they come back once image refresh hands out a new address or display alias.
   const now=Date.now()/1000,live=p=>{const oe=new URL(p.fetch_url).searchParams.get('oe');return !oe||parseInt(oe,16)>now+60;};
   const photo=(await DB.prepare("SELECT f.url,COALESCE((SELECT a.preview_url FROM instagram_preview_urls a WHERE a.code=p.code AND a.source_url=f.url),f.url) AS fetch_url FROM instagram_review p,json_each(CASE WHEN COALESCE(json_array_length(p.data,'$.images'),0)>0 THEN json_extract(p.data,'$.images') ELSE json_array(json_extract(p.data,'$.image')) END) m JOIN x_fingerprints f ON f.url=m.value WHERE p.status='kept' AND f.hash IS NOT NULL AND f.dhash IS NULL AND (f.error IS NULL OR (f.error='perceptual_retry' AND f.next_check<=unixepoch())) AND COALESCE(json_extract(p.data,'$.media['||m.key||'].kind'),'image')!='video' ORDER BY f.error IS NOT NULL").all()).results.find(live);
   if(photo){
    // Marked before decoding: if this invocation is killed for CPU, the photo is not picked again and cannot stall maintenance.
    await DB.prepare("UPDATE x_fingerprints SET error='perceptual_pending' WHERE url=? AND (error IS NULL OR error='perceptual_retry')").bind(photo.url).run();
    try{
     const fp=await instagramDhash(photo.fetch_url,env.IMAGES);
     // Only X photos in posts the feed shows (x_eligible, as x_photo_rows): a hand-hidden post's copy would hide nothing.
     // ponytail: a shown post hidden later lets its Instagram copies back without rematching; add a rematch if that shows up.
     const shown=(await DB.prepare("SELECT DISTINCT f.url,COALESCE(f.confirmed_hash,f.hash) AS hash,f.dhash,f.width,f.height FROM x_eligible p,json_each(p.data,'$.media') m JOIN x_fingerprints f ON f.url=json_extract(m.value,'$.previewUrl') WHERE f.dhash IS NOT NULL AND f.hash IS NOT NULL AND f.url LIKE 'https://pbs.twimg.com/%'").all()).results;
     const match=closest(shown,fp,nearInstagram);
     statements.push(DB.prepare('UPDATE x_fingerprints SET dhash=?,width=?,height=?,error=NULL,confirmed_hash=COALESCE(?,confirmed_hash),candidate_metadata_json=COALESCE(?,candidate_metadata_json) WHERE url=?').bind(fp.dhash,fp.width,fp.height,match?.hash??null,match?matchEvidence({url:photo.url,...fp},match,match.distance):null,photo.url));
    }catch(error){
     // A refused address or a failed transformation (such as the monthly free allowance running out) is retried daily; an undecodable result is final.
     statements.push(/^image_(http|transform)_/.test(error.message)?DB.prepare("UPDATE x_fingerprints SET error='perceptual_retry',next_check=unixepoch()+86400 WHERE url=?").bind(photo.url):DB.prepare("UPDATE x_fingerprints SET error='perceptual_failed' WHERE url=?").bind(photo.url));
    }
   }
  }
  const candidate=await DB.prepare('SELECT p.id,p.data FROM posts p LEFT JOIN x_quality q ON q.post_id=p.id WHERE COALESCE(q.next_check,0)<=unixepoch() ORDER BY COALESCE(q.next_check,0),p.id LIMIT 1').first();
  if(candidate){let state='retry',nextDueAt=null;try{state=await checkOriginal(JSON.parse(candidate.data),DB);}catch(error){if(error instanceof ProviderCooldownError)nextDueAt=error.nextDueAt;}
   if(nextDueAt!==null)statements.push(DB.prepare('INSERT INTO x_quality(post_id,next_check) VALUES(?,?) ON CONFLICT(post_id) DO UPDATE SET next_check=MAX(x_quality.next_check,excluded.next_check)').bind(candidate.id,nextDueAt));
   else statements.push(DB.prepare("INSERT INTO x_quality(post_id,availability,missing_count,checked_at,next_check) VALUES(?,?,?,unixepoch(),unixepoch()+?) ON CONFLICT(post_id) DO UPDATE SET availability=CASE WHEN ?='retry' THEN x_quality.availability ELSE excluded.availability END,missing_count=CASE WHEN ?='missing' THEN x_quality.missing_count+1 WHEN ?='available' THEN 0 ELSE x_quality.missing_count END,checked_at=excluded.checked_at,next_check=excluded.next_check").bind(candidate.id,state==='retry'?'unknown':state,state==='missing'?1:0,state==='missing'?21600:state==='retry'?3600:86400,state,state,state));
  }
  await DB.batch([DB.prepare('INSERT INTO commit_guard(token,ok) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM collection_control c,x_maintenance m WHERE c.id=1 AND c.enabled=1 AND c.revision=? AND m.id=1 AND m.token=? AND m.until_at>unixepoch()) THEN 1 ELSE 0 END').bind(token,lock.revision,token),...statements,DB.prepare('DELETE FROM commit_guard WHERE token=?').bind(token)]);
  await autoMergeX(DB);
 }finally{await DB.prepare('UPDATE x_maintenance SET until_at=0,token=NULL WHERE token=?').bind(token).run();}
}
// One open review pair per run goes through the review button's path, so it is audited and "묶음 해제" undoes it.
// ponytail: a pair that keeps failing is retried every run before the next one; skip-listing waits until that shows up.
async function autoMergeX(DB){
 const pairs=(await DB.prepare(`SELECT a.url AS left_url,b.url AS right_url,a.dhash AS left_dhash,b.dhash AS right_dhash FROM x_fingerprints a INDEXED BY x_review_near_url CROSS JOIN x_fingerprints b ON b.url=a.near_url
  WHERE a.near_url IS NOT NULL AND a.hash IS NOT NULL AND b.hash IS NOT NULL AND a.dhash IS NOT NULL AND b.dhash IS NOT NULL AND COALESCE(a.confirmed_hash,a.hash)!=COALESCE(b.confirmed_hash,b.hash)
   AND NOT EXISTS(SELECT 1 FROM x_photo_differences d WHERE d.left_url=min(a.url,b.url) AND d.right_url=max(a.url,b.url))`).all()).results;
 const control=await DB.prepare('SELECT revision FROM x_group_control WHERE id=1').first();
 for(const pair of pairs){
  const distance=hamming(pair.left_dhash,pair.right_dhash);if(distance>autoX)continue;
  try{await decidePhotos(DB,{action:'merge',left:pair.left_url,right:pair.right_url,groupRevision:control.revision,requestId:crypto.randomUUID(),reasonCode:'DUPLICATE_IMAGE',note:`사진 차이값 ${distance} (${autoX} 이하 자동)`},{id:'자동 판정'});return;}
  catch(error){console.log(JSON.stringify({event:'x_auto_merge',status:'failed',error:String(error?.message).slice(0,100)}));}
 }
}
