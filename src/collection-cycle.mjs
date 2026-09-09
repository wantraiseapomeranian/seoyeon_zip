export function startCycle(state,now) {
  if(state.cycle_started_at != null) return {...state};
  return {...state,cycle_started_at:now,
    cycle_boundary_at:state.committed_boundary_at == null ? 0 : state.committed_boundary_at-86400,
    next_cursor:null,pages_in_cycle:0,cursor_resets:0};
}

export function advanceCycle(state,page,now) {
  const next={...state,last_success_at:now,failures:0,last_error_code:null,
    pages_in_cycle:state.pages_in_cycle+1,next_cursor:page.nextCursor,next_due_at:now+300,next_lane:'latest'};
  if(state.next_cursor != null && page.nextCursor===state.next_cursor) {
    return {...next,catchup_status:'gap',history_paused:1,last_error_code:'repeated_cursor'};
  }
  const traversal=page.traversal??{};
  if(traversal.boundaryVerified || (traversal.exhausted && traversal.exhaustionVerified)) {
    return {...next,committed_boundary_at:state.cycle_started_at,last_complete_sync_at:now,
      cycle_started_at:null,cycle_boundary_at:null,next_cursor:null,pages_in_cycle:0,cursor_resets:0,
      next_due_at:now+1800,catchup_status:'idle'};
  }
  if(traversal.exhausted || page.nextCursor == null) {
    return {...next,catchup_status:'gap',history_paused:1,last_error_code:'unverified_exhaustion'};
  }
  return {...next,history_paused:next.pages_in_cycle>=20?1:0,
    catchup_status:next.pages_in_cycle>=20?'limited':'running'};
}

export function advanceLatest(state,page,now) {
  // Seed history from the first stored page only. Later fresh polls never replace its cursor.
  const next=state.pages_in_cycle===0 && !state.history_paused
    ? advanceCycle(state,page,now) : {...state,last_success_at:now,failures:0};
  return {...next,last_latest_success_at:now,next_due_at:now+300,
    next_lane:next.history_paused?'latest':'history',
    catchup_status:next.history_paused?(next.pages_in_cycle>=20?'limited':'gap'):'running',
    last_error_code:next.history_paused?'history_window_unverified':null};
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
