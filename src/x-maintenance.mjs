import jpeg from 'jpeg-js';
export const hamming=(a,b)=>{let x=BigInt('0x'+a)^BigInt('0x'+b),n=0;while(x){x&=x-1n;n++;}return n;};
export async function fingerprint(url){
 const u=new URL(url);const instagram=u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&/(^|\.)(cdninstagram\.com|fbcdn\.net)$/.test(u.hostname);if(!instagram&&(u.origin!=='https://pbs.twimg.com'||!u.pathname.startsWith('/media/')))throw Error('unsupported_image');
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
 const {width,height,data}=decoded;
 const lum=(x,y)=>{const i=(Math.min(height-1,Math.floor(y*height/8))*width+Math.min(width-1,Math.floor(x*width/9)))*4;return data[i]*.299+data[i+1]*.587+data[i+2]*.114;};
 let dhash=0n;for(let y=0;y<8;y++)for(let x=0;x<8;x++)dhash=(dhash<<1n)|BigInt(lum(x,y)>lum(x+1,y));
 return {hash,dhash:dhash.toString(16).padStart(16,'0'),width,height,version:2};
}
async function limitedBody(response,limit){
 const chunks=[];let size=0;const reader=response.body.getReader();
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw Error('oversized_response');}chunks.push(value);}
 const bytes=new Uint8Array(size);let n=0;for(const c of chunks){bytes.set(c,n);n+=c.length;}return bytes;
}
export async function checkOriginal(post){
 const u=new URL(post.canonicalUrl);if(u.origin!=='https://x.com'||!/^\/[A-Za-z0-9_]{1,15}\/status\/\d+$/.test(u.pathname))throw Error('invalid_post');
 const response=await fetch('https://api.fxtwitter.com'+u.pathname,{headers:{'User-Agent':'SeoyeonZip/0.1 (+https://seoyeon-zip.seoyeon-archive.workers.dev)'},redirect:'manual',signal:AbortSignal.timeout(15000)});
 if(response.status!==200&&response.status!==404){await response.body?.cancel();return 'retry';}
 const data=JSON.parse(new TextDecoder().decode(await limitedBody(response,1_000_000)));
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
   const fp=await fingerprint(image.url);const all=await DB.prepare('SELECT url,hash,dhash,width,height FROM x_fingerprints WHERE dhash IS NOT NULL AND hash!=?').bind(fp.hash).all();
   const near=fp.dhash&&all.results.find(f=>Math.abs(f.width/f.height-fp.width/fp.height)<.02&&hamming(f.dhash,fp.dhash)<=4);
   const evidence=near?JSON.stringify({schemaVersion:1,origin:'candidate_generation',generatedAt:new Date().toISOString(),leftImageUrl:image.url,rightImageUrl:near.url,algorithm:'dhash',algorithmVersion:'dhash-luma-9x8-v1',hashBits:64,sampleWidth:9,sampleHeight:8,distance:hamming(fp.dhash,near.dhash),threshold:4,aspectRatioTolerance:.02,leftAspectRatio:fp.width/fp.height,rightAspectRatio:near.width/near.height,leftWidth:fp.width,leftHeight:fp.height,rightWidth:near.width,rightHeight:near.height,leftDhash:fp.dhash,rightDhash:near.dhash,leftHash:fp.hash,rightHash:near.hash}):null;
   statements.push(DB.prepare('INSERT INTO x_fingerprints(url,hash,dhash,width,height,near_url,candidate_metadata_json) VALUES(?,?,?,?,?,?,?) ON CONFLICT(url) DO UPDATE SET hash=excluded.hash,dhash=excluded.dhash,width=excluded.width,height=excluded.height,near_url=excluded.near_url,candidate_metadata_json=excluded.candidate_metadata_json,error=NULL').bind(image.url,fp.hash,fp.dhash,fp.width,fp.height,near?.url??null,evidence));
  }catch{statements.push(DB.prepare("INSERT INTO x_fingerprints(url,error,next_check) VALUES(?,'image_check_failed',unixepoch()+86400) ON CONFLICT(url) DO UPDATE SET error=excluded.error,next_check=excluded.next_check").bind(image.url));}}
  const candidate=await DB.prepare('SELECT p.id,p.data FROM posts p LEFT JOIN x_quality q ON q.post_id=p.id WHERE COALESCE(q.next_check,0)<=unixepoch() ORDER BY COALESCE(q.next_check,0),p.id LIMIT 1').first();
  if(candidate){let state='retry';try{state=await checkOriginal(JSON.parse(candidate.data));}catch{}
   statements.push(DB.prepare("INSERT INTO x_quality(post_id,availability,missing_count,checked_at,next_check) VALUES(?,?,?,unixepoch(),unixepoch()+?) ON CONFLICT(post_id) DO UPDATE SET availability=CASE WHEN ?='retry' THEN x_quality.availability ELSE excluded.availability END,missing_count=CASE WHEN ?='missing' THEN x_quality.missing_count+1 WHEN ?='available' THEN 0 ELSE x_quality.missing_count END,checked_at=excluded.checked_at,next_check=excluded.next_check").bind(candidate.id,state==='retry'?'unknown':state,state==='missing'?1:0,state==='missing'?21600:state==='retry'?3600:86400,state,state,state));
  }
  await DB.batch([DB.prepare('INSERT INTO commit_guard(token,ok) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM collection_control c,x_maintenance m WHERE c.id=1 AND c.enabled=1 AND c.revision=? AND m.id=1 AND m.token=? AND m.until_at>unixepoch()) THEN 1 ELSE 0 END').bind(token,lock.revision,token),...statements,DB.prepare('DELETE FROM commit_guard WHERE token=?').bind(token)]);
 }finally{await DB.prepare('UPDATE x_maintenance SET until_at=0,token=NULL WHERE token=?').bind(token).run();}
}
