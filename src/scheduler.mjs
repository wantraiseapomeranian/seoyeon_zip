import { fetchPage,normalizePage,ProviderError } from './collection.mjs';
import { sources } from './sources.mjs';
import { startCycle,advanceCycle,advanceLatest,retryAt } from './collection-cycle.mjs';
import { acquireDueSource,commitPage,recordFailure } from './collection-state.mjs';

export async function runDueSource(env) {
  if(env.COLLECTION_ENABLED!=='true') return {status:'disabled'};
  const lease=await acquireDueSource(env.DB,crypto.randomUUID());
  if(!lease) return {status:'idle'};
  const state=startCycle(lease,lease.db_now);
  const source=sources.find(s=>s.handle===lease.source);
  let fetched,page;
  try {
    if(!source) throw new ProviderError(null,'unknown_source');
    fetched=await fetchPage(source.handle,state.next_lane==='latest'?null:state.next_cursor);
    if(fetched.kind==='not-modified') throw new ProviderError(204,'unexpected_204');
    try { page=normalizePage(fetched.json,source); }
    catch { throw new ProviderError(null,'provider_schema'); }
  } catch(error) {
    if(!(error instanceof ProviderError)) throw error;
    const retry=error.status===429 || (error.status>=500 && error.status<=599) ||
      ['provider_timeout','provider_network'].includes(error.code);
    const status=retry?'retry':'needs_attention';
    const now=(await env.DB.prepare('SELECT unixepoch() AS now').first()).now;
    // Only an explicitly recognized provider cursor-expiration code may restart a cycle.
    // FxEmbed's generic HTTP 400 is not such evidence.
    const resetCursor=state.next_lane==='history' && error.code==='cursor_expired' && state.cursor_resets<2;
    if(resetCursor) {
      state.next_cursor=null;state.cursor_resets++;
    }
    const outcome=resetCursor?'retry':status;
    const errorCode=error.status==null?error.code:`${error.code}:${error.status}`;
    try { await recordFailure(env.DB,lease,state,{code:errorCode,
      nextDueAt:retryAt(now,state.failures,error.retryAfter),status:outcome}); }
    catch(failure){if(failure.message==='stale_lease')return {status:'stale'};throw failure;}
    const result={status:outcome,source:lease.source,error:errorCode};
    console.log(JSON.stringify({event:'collection_failure',...result}));
    return result;
  }
  const now=(await env.DB.prepare('SELECT unixepoch() AS now').first()).now;
  const latest=state.next_lane==='latest';
  const next=latest?advanceLatest(state,page,now):advanceCycle(state,page,now);
  // Normalize the entire response, but never persist posts outside the fixed requested range.
  const boundary=latest?now-7*86400:state.cycle_boundary_at;
  const eligible={...page,reviewPosts:(page.reviewPosts||[]).filter(r=>Date.parse(r.post.publishedAt)/1000>=boundary),posts:page.posts.filter(p=>Date.parse(p.publishedAt)/1000>=boundary)};
  let results;
  try { results=await commitPage(env.DB,lease,eligible,next); }
  catch(error){if(error.message==='stale_lease')return {status:'stale'};throw error;}
  const observation={status:'stored',source:lease.source,lane:state.next_lane,received:page.receivedCount,stored:eligible.posts.length,
    cycleStatus:next.catchup_status,...fetched.observation,
    sqlScope:'page_commit',sqlStatements:results.length,
    rowsRead:results.reduce((n,r)=>n+(r.meta.rows_read??0),0),
    rowsWritten:results.reduce((n,r)=>n+(r.meta.rows_written??0),0)};
  try {
    const log=await env.DB.prepare('INSERT INTO runs(id,finished_at,data) VALUES(?,?,?)')
      .bind(crypto.randomUUID(),new Date(now*1000).toISOString(),JSON.stringify(observation)).run();
    observation.rowsRead+=log.meta.rows_read??0;observation.rowsWritten+=log.meta.rows_written??0;
    observation.sqlScope='page_commit_and_observation_log';observation.sqlStatements++;
  } catch {
    observation.warning='observation_log_failed';observation.rowsRead=null;observation.rowsWritten=null;
  }
  console.log(JSON.stringify({event:'collection_page',...observation}));
  return observation;
}
