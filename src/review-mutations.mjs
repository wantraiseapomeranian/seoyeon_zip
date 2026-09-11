import {auditError,auditRequest,findAuditReplay,auditGuard,commitAudit,digest} from './review-audit.mjs';
const conflict=()=>{throw auditError(409,'review_conflict');};
const replayOrConflict=async(DB,request)=>(await findAuditReplay(DB,request))??conflict();
const validRevision=n=>Number.isSafeInteger(n)&&n>=0;
const unchanged={saved:true,changed:false};

export async function decideXPost(DB,input,actor){
 if(!input||!/^x:\d{1,30}$/.test(input.id)||!['auto','visible','hidden'].includes(input.decision)||!validRevision(input.revision))throw auditError(400,'invalid_input');
 const action={auto:'RESET_AUTO',visible:'SHOW',hidden:'HIDE'}[input.decision];
 const request=await auditRequest(input,actor,action,{id:input.id,decision:input.decision,revision:input.revision});
 const replay=await findAuditReplay(DB,request);if(replay)return replay;
 const row=await DB.prepare("SELECT p.data,q.decision,q.revision,q.availability,EXISTS(SELECT 1 FROM x_feed_posts v WHERE v.id=p.id) AS visible FROM posts p LEFT JOIN x_quality q ON q.post_id=p.id WHERE p.id=?").bind(input.id).first();
 if(!row)throw auditError(404,'not_found');
 if((row.revision??0)!==input.revision)return replayOrConflict(DB,request);
 const old={decision:row.decision??'auto',revision:row.revision??0};
 if(old.decision===input.decision)return unchanged;
 const post=JSON.parse(row.data);
 const nearSql=`SELECT EXISTS(SELECT 1 FROM posts a,json_each(a.data,'$.media') am JOIN x_fingerprints af ON af.url=json_extract(am.value,'$.previewUrl'),posts b,json_each(b.data,'$.media') bm JOIN x_fingerprints bf ON bf.url=json_extract(bm.value,'$.previewUrl') WHERE a.id=? AND b.id!=a.id AND af.hash IS NOT NULL AND bf.hash IS NOT NULL AND COALESCE(af.confirmed_hash,af.hash)!=COALESCE(bf.confirmed_hash,bf.hash) AND (af.near_url=bf.url OR bf.near_url=af.url) AND NOT EXISTS(SELECT 1 FROM x_photo_differences d WHERE d.left_url=min(af.url,bf.url) AND d.right_url=max(af.url,bf.url))) AS found`;
 const near=(await DB.prepare(nearSql).bind(input.id).first()).found;
 const reviewReasons=[post.moderationReason,row.availability==='missing'?'원문 확인 불가':null,near?'유사 사진 후보':null].filter(Boolean);
 const displayState=old.decision==='auto'&&reviewReasons.length?'pending':row.visible?'visible':'hidden';
 const displayGuard=auditGuard(DB,`(${nearSql})=? AND EXISTS(SELECT 1 FROM x_feed_posts WHERE id=?)=?`,[input.id,near,input.id,row.visible]);
 const guard=auditGuard(DB,"EXISTS(SELECT 1 FROM posts p LEFT JOIN x_quality q ON q.post_id=p.id WHERE p.id=? AND p.data=? AND COALESCE(q.revision,0)=? AND q.decision IS ? AND q.availability IS ?)",[input.id,row.data,input.revision,row.decision,row.availability]);
 return commitAudit(DB,request,[guard,displayGuard],[DB.prepare('INSERT OR IGNORE INTO x_quality(post_id) VALUES(?)').bind(input.id),DB.prepare('UPDATE x_quality SET decision=?,revision=revision+1 WHERE post_id=?').bind(input.decision,input.id)],{
  platform:'X',type:'POST',target:input.id,previous:old,next:{decision:input.decision,revision:old.revision+1},
  metadata:{schemaVersion:1,author:post.authorHandle??'',url:post.canonicalUrl??null,thumbnailUrl:post.media?.[0]?.previewUrl??null,displayState,reviewReasons,availability:row.availability??'unknown'}
 });
}

export async function decideInstagram(DB,code,input,actor){
 if(!['pending','kept','excluded','held'].includes(input?.status)||!validRevision(input?.revision))throw auditError(400,'invalid_decision');
 const action={pending:'RESET_PENDING',kept:'KEEP',excluded:'EXCLUDE',held:'HOLD'}[input.status];
 const request=await auditRequest(input,actor,action,{code,status:input.status,revision:input.revision});
 const replay=await findAuditReplay(DB,request);if(replay)return replay;
 const row=await DB.prepare('SELECT data,status,revision,reviewed_at FROM instagram_review WHERE code=?').bind(code).first();
 if(!row)throw auditError(404,'not_found');if(row.revision!==input.revision)return replayOrConflict(DB,request);
 if(row.status===input.status)return unchanged;
 const post=JSON.parse(row.data),time=new Date().toISOString();
 const previous={status:row.status,revision:row.revision,reviewedAt:row.reviewed_at},next={status:input.status,revision:row.revision+1,reviewedAt:time};
 const guard=auditGuard(DB,'EXISTS(SELECT 1 FROM instagram_review WHERE code=? AND revision=? AND status=? AND data=? AND reviewed_at IS ?)',[code,row.revision,row.status,row.data,row.reviewed_at]);
 return commitAudit(DB,request,[guard],[DB.prepare('UPDATE instagram_review SET status=?,revision=revision+1,reviewed_at=? WHERE code=?').bind(input.status,time,code)],{
  platform:'INSTAGRAM',type:'POST',target:'ig:'+code,previous,next,metadata:{schemaVersion:1,author:post.author??'',url:post.url??null,thumbnailUrl:post.images?.[0]??post.image??post.media?.[0]?.previewUrl??null,reviewReasons:post.reasons??[]}
 });
}

// Read exactly the fingerprint fields used to decide and describe a group change.
// The identical SQL is executed again inside the guarded batch to catch maintenance races.
function groupQuery(urls,keys){
 const sql=`SELECT json_group_array(json_object('url',url,'hash',hash,'confirmed_hash',confirmed_hash,'dhash',dhash,'width',width,'height',height,'near_url',near_url,'candidate_metadata_json',candidate_metadata_json)) AS snapshot FROM (SELECT * FROM x_fingerprints WHERE url IN (SELECT value FROM json_each(?)) OR COALESCE(confirmed_hash,hash) IN (SELECT value FROM json_each(?)) ORDER BY url)`;
 return {sql,args:[JSON.stringify(urls),JSON.stringify(keys)]};
}
const referencesSql="SELECT json_group_array(json_object('image',image,'id',id,'url',url,'author',author,'position',position)) AS snapshot FROM (SELECT json_extract(m.value,'$.previewUrl') AS image,p.id,json_extract(p.data,'$.canonicalUrl') AS url,json_extract(p.data,'$.authorHandle') AS author,CAST(m.key AS INTEGER)+1 AS position FROM posts p,json_each(p.data,'$.media') m WHERE json_extract(m.value,'$.previewUrl') IN (SELECT value FROM json_each(?)) ORDER BY image,p.id,position)";

export async function decidePhotos(DB,input,actor){
 const action={merge:'MARK_SAME_IMAGE',different:'MARK_DIFFERENT_IMAGE',unmerge:'UNMERGE'}[input.action];
 if(!action||!validRevision(input.groupRevision))throw auditError(400,'invalid_input');
 const urls=input.action==='unmerge'?[input.image]:[input.left,input.right].sort();
 if(urls.some(u=>typeof u!=='string'||u.length>2048)||new Set(urls).size!==urls.length)throw auditError(400,'invalid_input');
 const request=await auditRequest(input,actor,action,{urls,groupRevision:input.groupRevision});
 const replay=await findAuditReplay(DB,request);if(replay)return replay;
 const control=await DB.prepare('SELECT revision FROM x_group_control WHERE id=1').first();if(control?.revision!==input.groupRevision)return replayOrConflict(DB,request);
 const selected=(await DB.prepare('SELECT * FROM x_fingerprints WHERE url IN (SELECT value FROM json_each(?))').bind(JSON.stringify(urls)).all()).results;
 if(selected.length!==urls.length||selected.some(f=>!f.hash))throw auditError(400,'invalid_input');
 const keys=[...new Set(selected.map(f=>f.confirmed_hash??f.hash))].sort();
 const query=groupQuery(urls,keys),snap=(await DB.prepare(query.sql).bind(...query.args).first()).snapshot;
 const members=JSON.parse(snap);
 // Group keys must belong to the same snapshot that the commit guard protects.
 if(selected.some(f=>{const member=members.find(m=>m.url===f.url);return !member||Object.keys(member).some(k=>member[k]!==f[k]);}))return replayOrConflict(DB,request);
 const difference=urls.length===2?!!await DB.prepare('SELECT 1 AS found FROM x_photo_differences WHERE left_url=? AND right_url=?').bind(...urls).first():false;
 if((input.action==='merge'&&keys.length===1)||(input.action==='different'&&difference)||(input.action==='unmerge'&&!selected[0].confirmed_hash)){
  const saved=await findAuditReplay(DB,request);if(saved)return saved;
  const latest=await DB.prepare('SELECT revision FROM x_group_control WHERE id=1').first();
  if(latest?.revision!==input.groupRevision)return replayOrConflict(DB,request);
  return unchanged;
 }
 // An exact/currently merged pair cannot truthfully be marked different without first unmerging.
 if(input.action==='different'&&keys.length===1)throw auditError(409,'review_conflict');
 const imageUrls=members.map(f=>f.url),refsArg=JSON.stringify(imageUrls);
 const refsSnapshot=(await DB.prepare(referencesSql).bind(refsArg).first()).snapshot;
 const refs=JSON.parse(refsSnapshot);
 if(urls.some(url=>!refs.some(r=>r.image===url)))throw auditError(400,'invalid_input');
 const images=imageUrls.map(url=>({url,posts:refs.filter(r=>r.image===url).map(({id,url,author,position})=>({id,url,author,position}))}));
 let evidence=null;
 for(const f of selected){if(!f.candidate_metadata_json)continue;try{const e=JSON.parse(f.candidate_metadata_json);if([e.leftImageUrl,e.rightImageUrl].sort().join('\n')===urls.join('\n')){evidence=e;break;}}catch{}}
 const exact=selected.length===2&&selected[0].hash===selected[1].hash;
 const previous={groupRevision:control.revision,members,different:difference};
 const newHash='review:'+crypto.randomUUID();
 const next={groupRevision:control.revision+1,members:members.map(f=>({...f,confirmed_hash:input.action==='merge'?newHash:input.action==='unmerge'&&f.url===input.image?null:f.confirmed_hash})),different:input.action==='different'?true:difference};
 const guards=[auditGuard(DB,'(SELECT revision FROM x_group_control WHERE id=1)=?',[control.revision]),auditGuard(DB,`(${query.sql}) IS ?`,[...query.args,snap]),auditGuard(DB,`(${referencesSql}) IS ?`,[refsArg,refsSnapshot])];
 if(urls.length===2)guards.push(auditGuard(DB,'EXISTS(SELECT 1 FROM x_photo_differences WHERE left_url=? AND right_url=?)=?',[...urls,difference?1:0]));
 let change;
 if(input.action==='merge')change=DB.prepare('UPDATE x_fingerprints SET confirmed_hash=? WHERE url IN (SELECT value FROM json_each(?))').bind(newHash,refsArg);
 else if(input.action==='different')change=DB.prepare('INSERT INTO x_photo_differences(left_url,right_url) VALUES(?,?)').bind(...urls);
 else change=DB.prepare('UPDATE x_fingerprints SET confirmed_hash=NULL WHERE url=?').bind(input.image);
 return commitAudit(DB,request,guards,[change,DB.prepare('UPDATE x_group_control SET revision=revision+1 WHERE id=1')],{
  platform:'X',type:input.action==='unmerge'?'IMAGE_GROUP':'IMAGE_PAIR',target:await digest(input.action==='unmerge'?input.image:JSON.stringify(urls)),previous,next,
  metadata:{schemaVersion:1,images,leftImageUrl:urls[0],rightImageUrl:urls[1]??null,author:refs.find(r=>r.image===urls[0])?.author??'',url:refs.find(r=>r.image===urls[0])?.url??null,candidateEvidence:evidence,evidenceStatus:evidence?'recorded':'legacy_unavailable',evidenceKind:exact?'exact_file':input.action==='unmerge'?'manual_group':evidence?'dhash_candidate':'unknown',humanDecision:action}
 });
}
