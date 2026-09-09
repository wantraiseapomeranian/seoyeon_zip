import test from 'node:test';
import assert from 'node:assert/strict';
import { startCycle,advanceCycle,retryAt } from '../src/collection-cycle.mjs';
test('initial seven days; overlap fixed; partial and catchup never advance boundary',()=>{
  assert.equal(startCycle({},1000000).cycle_boundary_at,395200);
  const state=startCycle({committed_boundary_at:100000},200000);
  assert.equal(state.cycle_boundary_at,13600);
  const next=advanceCycle({...state,pages_in_cycle:19},{nextCursor:'b',traversal:{}},200010);
  assert.equal(next.committed_boundary_at,100000);assert.equal(next.catchup_status,'catchup');
  assert.equal(next.next_cursor,'b');assert.equal(next.last_success_at,200010);
});
test('unverified exhaustion is a gap; repeated cursor needs attention; verified boundary completes',()=>{
  const state=startCycle({committed_boundary_at:100000,next_cursor:null},200000);
  const gap=advanceCycle(state,{nextCursor:null,traversal:{exhausted:true}},200010);
  assert.equal(gap.catchup_status,'gap');assert.equal(gap.committed_boundary_at,100000);
  const repeated=advanceCycle({...state,next_cursor:'a'},{nextCursor:'a',traversal:{}},200010);
  assert.equal(repeated.catchup_status,'needs_attention');
  const done=advanceCycle(state,{nextCursor:null,traversal:{boundaryVerified:true}},200010);
  assert.equal(done.committed_boundary_at,200000);assert.equal(done.last_complete_sync_at,200010);
  assert.equal(done.cycle_started_at,null);assert.equal(done.next_due_at,201810);
});
test('Retry-After seconds or future HTTP date; bounded fallback for invalid values',()=>{
  assert.equal(retryAt(1000,0,'120'),1120);
  const now=1700000000;assert.equal(retryAt(now,0,new Date((now+120)*1000).toUTCString()),now+120);
  assert.equal(retryAt(now,0,'bad'),now+1800);assert.equal(retryAt(now,1,null),now+3600);
  assert.equal(retryAt(now,9,null),now+21600);assert.equal(retryAt(now,0,'-1'),now+1800);
});
