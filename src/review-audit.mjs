// Only successful, state-changing human decisions belong in this ledger.
export const reasons={
 SHOW:['SEOYEON_CONFIRMED','FALSE_POSITIVE','OTHER'],
 HIDE:['NOT_SEOYEON','PRODUCT_IMAGE','EVENT_NOTICE','ADVERTISEMENT','DUPLICATE_IMAGE','SOURCE_DELETED','OTHER'],
 RESET_AUTO:['RETURN_TO_AUTO','OTHER'], KEEP:['SEOYEON_CONFIRMED','FALSE_POSITIVE','OTHER'],
 EXCLUDE:['NOT_SEOYEON','PRODUCT_IMAGE','EVENT_NOTICE','ADVERTISEMENT','DUPLICATE_IMAGE','SOURCE_DELETED','OTHER'],
 HOLD:['NEEDS_REVIEW','OTHER'], RESET_PENDING:['NEEDS_REVIEW','OTHER'],
 MARK_SAME_IMAGE:['DUPLICATE_IMAGE','OTHER'],MARK_DIFFERENT_IMAGE:['DISTINCT_IMAGE','FALSE_POSITIVE','OTHER'],UNMERGE:['GROUP_CORRECTION','FALSE_POSITIVE','OTHER']
};
export const auditError=(status,code)=>Object.assign(new Error(code),{status});
export function requireActor(context){if(!context?.actor||typeof context.actor.id!=='string'||!context.actor.id)throw auditError(401,'access_denied');return context.actor;}
export async function digest(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(n=>n.toString(16).padStart(2,'0')).join('');}
export async function auditRequest(input,actor,action,target){
 if(!input?.requestId||!input?.reasonCode)throw auditError(400,'review_client_outdated');
 if(typeof input.requestId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId)||!reasons[action]?.includes(input.reasonCode)||
  (input.note!=null&&(typeof input.note!=='string'||input.note.length>1000))||['reviewedBy','reviewed_by','reviewedAt','actor'].some(k=>k in input))throw auditError(400,'invalid_decision');
 const note=input.note?.trim()||null;
 return {requestId:input.requestId.toLowerCase(),fingerprint:await digest(JSON.stringify({action,target,reason:input.reasonCode,note})),actor:actor.id,action,reason:input.reasonCode,note};
}
export async function findAuditReplay(DB,request){
 const old=await DB.prepare('SELECT id,request_fingerprint,reviewed_by FROM review_audit_log WHERE request_id=?').bind(request.requestId).first();
 if(!old)return null;
 if(old.request_fingerprint!==request.fingerprint||old.reviewed_by!==request.actor)throw auditError(409,'review_conflict');
 return {saved:true,changed:true,auditId:old.id};
}
export function auditInsert(DB,event){
 const {request:r}=event,previous=JSON.stringify(event.previous),next=JSON.stringify(event.next),metadata=JSON.stringify(event.metadata);
 if(new TextEncoder().encode(previous+next+metadata).byteLength>256*1024)throw auditError(413,'audit_snapshot_too_large');
 return DB.prepare('INSERT INTO review_audit_log(id,request_id,request_fingerprint,platform,target_type,target_id,action,previous_state,new_state,reason_code,note,reviewed_by,metadata_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
  .bind(event.id,r.requestId,r.fingerprint,event.platform,event.type,event.target,r.action,previous,next,r.reason,r.note,r.actor,metadata);
}
export function auditGuard(DB,condition,args=[]){const token=crypto.randomUUID();return {statement:DB.prepare(`INSERT INTO commit_guard(token,ok) SELECT ?,CASE WHEN (${condition}) THEN 1 ELSE 0 END`).bind(token,...args),cleanup:DB.prepare('DELETE FROM commit_guard WHERE token=?').bind(token)};}
export async function commitAudit(DB,request,guards,changes,event){
 const id=crypto.randomUUID();const insert=auditInsert(DB,{...event,id,request});
 try{await DB.batch([...guards.map(g=>g.statement),...changes,insert,...guards.map(g=>g.cleanup)]);}
 catch(error){
  // A concurrent identical request may have committed while we prepared our snapshot.
  const replay=await findAuditReplay(DB,request);if(replay)return replay;
  if(/CHECK constraint failed/i.test(String(error)))throw auditError(409,'review_conflict');
  throw auditError(503,'review_storage_unavailable');
 }
 return {saved:true,changed:true,auditId:id};
}
export function auditFailure(error){return Response.json({error:error.status?error.message:'review_storage_unavailable'},{status:error.status??503,headers:{'Cache-Control':'private, no-store'}});}
