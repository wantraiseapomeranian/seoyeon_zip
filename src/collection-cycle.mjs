export function startCycle(state,now) {
  if(state.cycle_started_at != null) return {...state};
  return {...state,cycle_started_at:now,
    cycle_boundary_at:state.committed_boundary_at == null ? now-7*86400 : state.committed_boundary_at-86400,
    next_cursor:null,pages_in_cycle:0,cursor_resets:0};
}

export function advanceCycle(state,page,now) {
  const next={...state,last_success_at:now,failures:0,last_error_code:null,
    pages_in_cycle:state.pages_in_cycle+1,next_cursor:page.nextCursor,next_due_at:now+300};
  if(state.next_cursor != null && page.nextCursor===state.next_cursor) {
    return {...next,catchup_status:'needs_attention',last_error_code:'repeated_cursor'};
  }
  const traversal=page.traversal??{};
  if(traversal.boundaryVerified || (traversal.exhausted && traversal.exhaustionVerified)) {
    return {...next,committed_boundary_at:state.cycle_started_at,last_complete_sync_at:now,
      cycle_started_at:null,cycle_boundary_at:null,next_cursor:null,pages_in_cycle:0,cursor_resets:0,
      next_due_at:now+1800,catchup_status:'idle'};
  }
  if(traversal.exhausted || page.nextCursor == null) {
    return {...next,catchup_status:'gap',last_error_code:'unverified_exhaustion'};
  }
  return {...next,catchup_status:next.pages_in_cycle>=20?'catchup':'running'};
}

export function retryAt(now,failures,retryAfter) {
  const text=retryAfter?.trim();
  if(text && /^\d+$/.test(text)) {
    const seconds=Number(text);
    if(Number.isSafeInteger(seconds) && Number.isSafeInteger(now+seconds)) return now+seconds;
  }
  // Accept HTTP dates, not ambiguous numeric strings interpreted as calendar dates.
  const date=text && /^[A-Za-z]{3},/.test(text) ? Date.parse(text)/1000 : NaN;
  if(Number.isFinite(date) && date>now) return Math.ceil(date);
  return now+Math.min(1800*2**Math.min(failures,4),21600);
}
