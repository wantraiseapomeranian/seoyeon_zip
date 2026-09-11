const historyNotes=new Set(['history_window_unverified','unverified_exhaustion','repeated_cursor']);

// Public responses are explicit projections, never copies of collection/review records.
export function publicSource(s) {
 const paused=!s.enabled||s.collection_enabled===false||s.collection_enabled===0;
 const error=s.catchup_status==='needs_attention'||Boolean(s.last_error_code&&!historyNotes.has(s.last_error_code));
 return {source:s.source,state:paused?'paused':error?'attention':s.last_success_at==null?'waiting':'ok',
  lastSuccessAt:s.last_success_at==null?null:new Date(s.last_success_at*1000).toISOString()};
}

export function publicPost(p) {
 return {id:p.id,publishedAt:p.publishedAt,canonicalUrl:p.canonicalUrl,
  authorHandle:p.authorHandle,observedViaSource:p.observedViaSource,
  platform:p.platform,contentKind:p.contentKind,caption:p.caption,
  manual:p.manual,dateEstimated:p.dateEstimated,
  media:(p.media??[]).map(m=>({kind:m.kind,previewUrl:m.previewUrl,width:m.width,height:m.height})),
  duplicateSources:(p.duplicateSources??[]).map(s=>({url:s.url,author:s.author}))};
}
