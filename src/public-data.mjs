const historyNotes=new Set(['history_window_unverified','unverified_exhaustion','repeated_cursor']);

function collectionReason(code) {
 const status=/^provider_(?:http|json)_error:(\d{3})$/.exec(code)?.[1];
 if(status==='404')return 'not_found';
 if(status==='429')return 'rate_limit';
 if(status==='401'||status==='403')return 'access_denied';
 if(status?.startsWith('5'))return 'provider_unavailable';
 if(code==='provider_timeout')return 'timeout';
 if(code==='provider_network')return 'network';
 if(code==='storage_error')return 'storage';
 if(/^(?:invalid_json|provider_schema|response_too_large|unexpected_204)(?::\d{3})?$/.test(code))return 'invalid_response';
 return 'unknown';
}

// Public responses are explicit projections, never copies of collection/review records.
export function publicSource(s) {
 const paused=!s.enabled||s.collection_enabled===false||s.collection_enabled===0;
 const error=s.catchup_status==='needs_attention'||Boolean(s.last_error_code&&!historyNotes.has(s.last_error_code));
 const state=paused?'paused':s.catchup_status==='needs_attention'?'attention':s.catchup_status==='retry'?'retry':error?'attention':s.last_success_at==null?'waiting':'ok';
 return {source:s.source,state,reason:['retry','attention'].includes(state)?collectionReason(s.last_error_code):null,
  lastSuccessAt:s.last_success_at==null?null:new Date(s.last_success_at*1000).toISOString()};
}

export function publicPost(p) {
 return {id:p.id,publishedAt:p.publishedAt,canonicalUrl:p.canonicalUrl,
  ...(p.platform==='youtube'?{title:p.title,channelTitle:p.channelTitle,durationSeconds:p.durationSeconds}:{}),
  authorHandle:p.authorHandle,observedViaSource:p.observedViaSource,
  platform:p.platform,contentKind:p.contentKind,caption:p.caption,
  manual:p.manual,dateEstimated:p.dateEstimated,
  media:(p.media??[]).map(m=>({kind:m.kind,previewUrl:m.previewUrl,width:m.width,height:m.height})),
  duplicateSources:(p.duplicateSources??[]).map(s=>({url:s.url,author:s.author}))};
}
