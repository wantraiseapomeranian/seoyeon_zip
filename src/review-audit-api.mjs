const actions=new Set(['SHOW','HIDE','RESET_AUTO','KEEP','EXCLUDE','HOLD','RESET_PENDING','MARK_SAME_IMAGE','MARK_DIFFERENT_IMAGE','UNMERGE']);
const reply=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
const invalid=()=>{throw new Error('invalid_query');};
const baseColumns='id,platform,target_type,target_id,action,reason_code,note,reviewed_by,reviewed_at';
// Select just the author and original link. Group membership and evidence belong to detail responses.
const summaryColumns="json_extract(metadata_json,'$.author') AS author,json_extract(metadata_json,'$.url') AS url";

function dateBoundary(value,end=false) {
  if(!value)return null;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))invalid();
  const time=Date.parse(value+'T00:00:00.000Z');
  if(!Number.isFinite(time)||new Date(time).toISOString().slice(0,10)!==value)invalid();
  return new Date(time-9*3600000+(end?86400000:0)).toISOString();
}

function queryFilters(params) {
  for(const key of params.keys())if(!['platform','action','from','to','cursor'].includes(key)||params.getAll(key).length!==1)invalid();
  const filters={platform:params.get('platform')||null,action:params.get('action')||null,from:params.get('from')||null,to:params.get('to')||null};
  if(filters.platform&&!['X','INSTAGRAM'].includes(filters.platform)||filters.action&&!actions.has(filters.action))invalid();
  const from=dateBoundary(filters.from),to=dateBoundary(filters.to,true);
  if(filters.from&&filters.to&&filters.from>filters.to)invalid();
  const clauses=[],args=[];
  for(const [column,value,operator] of [['platform',filters.platform,'='],['action',filters.action,'='],['reviewed_at',from,'>='],['reviewed_at',to,'<']]) {
    if(value){clauses.push(`${column} ${operator} ?`);args.push(value);}
  }
  if(params.has('cursor')) {
    const raw=params.get('cursor');
    if(!raw||raw.length>2048||!/^[A-Za-z0-9_-]+$/.test(raw))invalid();
    let cursor;try{cursor=JSON.parse(atob(raw.replaceAll('-','+').replaceAll('_','/')));}catch{invalid();}
    if(!cursor||cursor.v!==1||JSON.stringify(cursor.filters)!==JSON.stringify(filters)||typeof cursor.id!=='string'||!cursor.id||cursor.id.length>128||!/^[A-Za-z0-9_-]+$/.test(cursor.id)||typeof cursor.time!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(cursor.time)||!Number.isFinite(Date.parse(cursor.time))||new Date(cursor.time).toISOString()!==cursor.time)invalid();
    clauses.push('(reviewed_at < ? OR (reviewed_at = ? AND id < ?))');args.push(cursor.time,cursor.time,cursor.id);
  }
  return {filters,args,where:clauses.length?' WHERE '+clauses.join(' AND '):''};
}

function item(row) {
  return {id:row.id,platform:row.platform,targetType:row.target_type,targetId:row.target_id,action:row.action,reasonCode:row.reason_code,note:row.note,reviewedBy:row.reviewed_by,reviewedAt:row.reviewed_at,summary:{author:row.author??null,url:row.url??null}};
}

export async function handleReviewAudit(request,env,context) {
  if(typeof context?.actor?.id!=='string'||!context.actor.id)return reply({error:'access_denied'},401);
  if(request.method!=='GET')return reply({error:'method_not_allowed'},405);
  const url=new URL(request.url),prefix='/api/admin/review-audit';
  if(url.pathname===prefix) {
    let query;try{query=queryFilters(url.searchParams);}catch{return reply({error:'invalid_review_audit_query'},400);}
    try {
      const {results}=await env.DB.prepare(`SELECT ${baseColumns},${summaryColumns} FROM review_audit_log${query.where} ORDER BY reviewed_at DESC,id DESC LIMIT 26`).bind(...query.args).all();
      const control=await env.DB.prepare('SELECT started_at FROM review_audit_control WHERE id=1').first();
      const rows=results.slice(0,25),last=rows.at(-1);
      const nextCursor=results.length>25?btoa(JSON.stringify({v:1,filters:query.filters,time:last.reviewed_at,id:last.id})).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,''):null;
      return reply({items:rows.map(item),nextCursor,startedAt:control?.started_at??null});
    }catch{return reply({error:'review_audit_unavailable'},503);}
  }
  const id=url.pathname.slice(prefix.length+1);
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(id))return reply({error:'not_found'},404);
  try {
    const row=await env.DB.prepare(`SELECT ${baseColumns},${summaryColumns},previous_state,new_state,metadata_json FROM review_audit_log WHERE id=?`).bind(id).first();
    if(!row)return reply({error:'not_found'},404);
    return reply({item:{...item(row),previousState:JSON.parse(row.previous_state),newState:JSON.parse(row.new_state),metadata:JSON.parse(row.metadata_json)}});
  }catch{return reply({error:'review_audit_unavailable'},503);}
}
