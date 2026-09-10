export async function acquireDueSource(DB,token) {
  return DB.prepare(`UPDATE collection_state
    SET lease_token=?,lease_until=unixepoch()+120,last_attempt_at=unixepoch(),revision=revision+1,
      cycle_boundary_at=CASE WHEN cycle_started_at IS NULL
        THEN COALESCE(committed_boundary_at-86400,0) ELSE cycle_boundary_at END,
      cycle_started_at=COALESCE(cycle_started_at,unixepoch())
    WHERE source=(SELECT source FROM collection_state
      WHERE enabled=1 AND next_due_at<=unixepoch()
        AND catchup_status!='needs_attention'
        AND (lease_until IS NULL OR lease_until<=unixepoch())
      ORDER BY next_due_at,COALESCE(last_attempt_at,0),source LIMIT 1)
    AND EXISTS(SELECT 1 FROM collection_control WHERE id=1 AND enabled=1)
    RETURNING *,unixepoch() AS db_now,
      (SELECT revision FROM collection_control WHERE id=1) AS control_revision`).bind(token).first();
}

export async function stopCollection(DB) {
  return DB.prepare('UPDATE collection_control SET enabled=0,revision=revision+1 WHERE id=1').run();
}

const fields=['next_due_at','last_success_at','last_complete_sync_at','committed_boundary_at',
  'cycle_started_at','cycle_boundary_at','next_cursor','pages_in_cycle','failures','cursor_resets','last_error_code','catchup_status',
  'next_lane','last_latest_success_at','history_paused'];

function guard(DB,lease,token) {
  return DB.prepare(`INSERT INTO commit_guard(token,ok)
    SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM collection_state s JOIN collection_control c ON c.id=1
      WHERE s.source=? AND s.enabled=1 AND s.lease_token=? AND s.revision=?
        AND s.lease_until>unixepoch() AND c.enabled=1 AND c.revision=?) THEN 1 ELSE 0 END`)
    .bind(token,lease.source,lease.lease_token,lease.revision,lease.control_revision);
}

async function commitState(DB,lease,state,statements=[]) {
  const token=crypto.randomUUID();
  try {
    return await DB.batch([guard(DB,lease,token),...statements,
      DB.prepare(`UPDATE collection_state SET ${fields.map(f=>`${f}=?`).join(',')},
        revision=revision+1,lease_token=NULL,lease_until=NULL WHERE source=?`)
        .bind(...fields.map(f=>state[f]??null),lease.source),
      DB.prepare('DELETE FROM commit_guard WHERE token=?').bind(token)]);
  } catch(error) {
    if(/CHECK constraint failed/.test(String(error))) throw new Error('stale_lease');
    throw error;
  }
}

export async function commitPage(DB,lease,page,nextState,{stopAfterPage=false}={}) {
  const posts=JSON.stringify(page.posts);
  const ids=JSON.stringify(page.posts.map(p=>p.id));
  const media=JSON.stringify(page.posts.flatMap(p=>p.media.map(m=>({...m,postId:p.id}))));
  return commitState(DB,lease,nextState,[
    ...(stopAfterPage?[DB.prepare('UPDATE collection_state SET enabled=0 WHERE source=?').bind(lease.source)]:[]),
    DB.prepare('UPDATE collection_state SET last_received_count=?,last_matched_count=?,last_review_count=? WHERE source=?')
      .bind(page.receivedCount??null,page.posts.length,(page.reviewPosts||[]).length,lease.source),
    ...((page.reviewPosts||[]).length?[DB.prepare("INSERT INTO official_review(post_id,source,reason,rule_version,data) SELECT json_extract(value,'$.post.id'),?,json_extract(value,'$.reason'),json_extract(value,'$.version'),json_extract(value,'$.post') FROM json_each(?) WHERE true ON CONFLICT(post_id) DO UPDATE SET reason=excluded.reason,rule_version=excluded.rule_version,data=excluded.data,last_seen_at=unixepoch()").bind(lease.source,JSON.stringify(page.reviewPosts))]:[]),
    DB.prepare("INSERT INTO posts(id,data) SELECT json_extract(value,'$.id'),value FROM json_each(?) WHERE true ON CONFLICT(id) DO UPDATE SET data=excluded.data").bind(posts),
    DB.prepare("DELETE FROM media WHERE post_id IN (SELECT value FROM json_each(?))").bind(ids),
    DB.prepare("INSERT INTO media(post_id,position,data) SELECT json_extract(value,'$.postId'),json_extract(value,'$.position'),value FROM json_each(?)").bind(media),
    DB.prepare("INSERT OR IGNORE INTO discoveries(post_id,source) SELECT value,? FROM json_each(?)").bind(lease.source,ids)
  ]);
}

export async function recordFailure(DB,lease,state,{code,nextDueAt,status}) {
  return commitState(DB,lease,{...state,failures:state.failures+1,
    next_due_at:nextDueAt,last_error_code:code,catchup_status:status});
}

export async function scheduleRetry(DB,source) {
  const result=await DB.prepare(`UPDATE collection_state SET next_due_at=unixepoch()
    WHERE source=? AND enabled=1 AND catchup_status!='needs_attention'
    AND EXISTS(SELECT 1 FROM collection_control WHERE id=1 AND enabled=1)`).bind(source).run();
  return result.meta.changes===1;
}

export async function listSources(DB) {
  const {results}=await DB.prepare(`SELECT source,enabled,revision,last_success_at,last_complete_sync_at,
    catchup_status,last_error_code,next_lane,last_latest_success_at,history_paused,pages_in_cycle,
    last_attempt_at,next_due_at,last_received_count,last_matched_count,last_review_count,
    (SELECT enabled FROM collection_control WHERE id=1) AS collection_enabled
    FROM collection_state ORDER BY source`).all();
  return results;
}
