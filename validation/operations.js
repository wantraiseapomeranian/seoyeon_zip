const $=selector=>document.querySelector(selector);
const statusNames={disabled:'중지됨',completed:'과거 수집 완료',unconfigured:'설정 필요',waiting:'첫 처리 대기',running:'처리 중',healthy:'정상',retry:'재시도 대기',attention:'확인 필요',delayed:'처리 지연'};
const needsAttention=status=>['retry','attention','delayed','unconfigured'].includes(status);
const count=value=>new Intl.NumberFormat('ko-KR').format(value)+'건';
const timestamp=value=>value?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value)):'기록 없음';
function node(tag,text,className){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;}
function values(target,entries){target.replaceChildren(...entries.map(([label,value])=>{const row=node('div');row.append(node('dt',label),node('dd',value));return row;}));}
function state(status){const el=node('span',statusNames[status]||'상태 확인 필요','ops-state');el.dataset.attention=String(needsAttention(status));return el;}
function render(data){
 const issues=[];
 for(const source of data.x.sources)if(needsAttention(source.status))issues.push({text:'X @'+source.source+' · '+statusNames[source.status],href:'/?manage=collection'});
 const ig=data.instagram;
 if(needsAttention(ig.status))issues.push({text:'Instagram · '+statusNames[ig.status],href:'/admin/instagram'});
 if(!['disabled','unconfigured'].includes(ig.status)&&ig.pendingErrors)issues.push({text:'Instagram 자료 처리 실패 '+count(ig.pendingErrors),href:'/admin/instagram'});
 if(!['disabled','unconfigured'].includes(ig.status)&&ig.overdue)issues.push({text:'Instagram 대기 작업 지연 '+count(ig.overdue),href:'/admin/instagram'});
 if(data.manual.enabled&&data.manual.counts.failed)issues.push({text:'직접 등록 사진 조회 실패 '+count(data.manual.counts.failed),href:'/?manage=tools'});
 if(data.manual.enabled&&data.manual.overdue)issues.push({text:'직접 등록 사진 조회 지연 '+count(data.manual.overdue),href:'/?manage=tools'});
 $('#attention-summary').textContent=issues.length?'아래 항목의 상태를 확인해 주세요.':'현재 기록에서 확인이 필요한 항목은 없어요.';
 $('#operations-issues').replaceChildren(...issues.map(issue=>{const li=node('li'),link=node('a',issue.text);link.href=issue.href;li.append(link);return li;}));
 $('#delay-note').textContent='조회 가능 시각 이후 X는 '+Math.round(data.x.delayGraceSeconds/60)+'분, 인스타·직접 등록은 '+Math.round(data.delayGraceSeconds/60)+'분을 넘기면 지연으로 표시해요. X의 3분 간격 순차 처리와 중지·처리 중 상태를 반영합니다.';
 $('#x-summary').textContent=data.x.enabled?'계정별 수집 상태예요. 시각은 한국시간으로 표시합니다.':'전체 X 수집이 중지되어 있어요. 마지막 기록을 표시합니다.';
 const active=data.x.sources.filter(source=>source.enabled).length;
 values($('#x-values'),[['수집 켜짐',active+'개 계정'],['중지·완료',(data.x.sources.length-active)+'개 계정'],['확인 필요',data.x.sources.filter(source=>needsAttention(source.status)).length+'개 계정']]);
 $('#x-details-title').textContent='계정별 상태 보기 · '+data.x.sources.length+'개';
 $('#x-sources').replaceChildren(...data.x.sources.map(source=>{
  const li=node('li',undefined,'ops-source'),heading=node('div',undefined,'ops-source-heading');heading.append(node('strong','@'+source.source),state(source.status));
  const dl=node('dl',undefined,'ops-values');values(dl,[['마지막 성공',timestamp(source.lastSuccessAt)],['다음 조회 가능',source.enabled?timestamp(source.nextDueAt):'중지됨'],['연속 실패',count(source.failures)]]);
  const detail=node('details'),summary=node('summary','수집 기록 자세히');detail.append(summary,node('p','마지막 시도 · '+timestamp(source.lastAttemptAt)),node('p','전체 동기화 완료 · '+timestamp(source.lastCompleteSyncAt)));
  if(source.error)detail.append(node('p','최근 오류 · '+source.error,'ops-warning'));li.append(heading,dl,detail);return li;
 }));
 if(!data.x.sources.length)$('#x-sources').append(node('li','등록된 수집 계정이 없어요.','muted'));
 $('#instagram-status').replaceChildren(state(ig.status));
 values($('#instagram-values'),[['외부 실행 확인',timestamp(ig.checkedAt)],['자료 저장 성공',timestamp(ig.syncedAt)],['다음 확인 예정',['disabled','unconfigured'].includes(ig.status)?'진행 안 함':timestamp(ig.nextDueAt)],['자료 처리 대기',count(ig.pending)],['대기 중 오류',count(ig.pendingErrors)],['연속 확인 실패',count(ig.failures)]]);
 $('#instagram-error').textContent=ig.error?'최근 오류 · '+ig.error:'';
 $('#manual-status').textContent=data.manual.enabled?'사진 조회가 켜져 있어요. 등록된 작업의 현재 상태입니다.':'사진 자동 조회가 중지되어 있어요. 저장된 작업 상태를 표시합니다.';
 const labels={pending:'조회 대기',starting:'조회 시작 중',waiting:'외부 처리 중',ready:'사진 조회 완료',no_media:'사진 없음',failed:'조회 실패',existing:'기존 자료 연결'};
 values($('#manual-values'),Object.entries(labels).map(([key,label])=>[label,count(data.manual.counts[key])]));
 values($('#total-values'),[['X 저장 게시물',count(data.totals.x)],['인스타 검토 자료',count(data.totals.instagram)],['직접 등록 자료',count(data.totals.manual)]]);
 $('#operations-updated').textContent='마지막 확인 · '+timestamp(data.generatedAt)+' (한국시간)';
}
let loading=false,lastSuccess=false;
async function refresh(){
 if(loading)return;loading=true;const button=$('#operations-refresh');button.setAttribute('aria-disabled','true');$('#operations-status').textContent='운영 현황을 불러오고 있어요.';$('#operations-error').textContent='';
 try{
  const response=await fetch('/api/admin/operations',{cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(response.status===401||response.status===403){$('#operations-content').hidden=true;$('#operations-content').replaceChildren();$('#operations-login').hidden=false;$('#operations-updated').textContent='관리자 인증이 만료되었거나 접근 권한이 없어요.';button.hidden=true;lastSuccess=false;throw Error('auth');}
  if(!response.ok)throw Error('load');
  render(await response.json());lastSuccess=true;$('#operations-content').hidden=false;$('#operations-content').dataset.stale='false';$('#operations-status').textContent='현황을 확인했어요.';
 }catch(error){$('#operations-error').textContent=error.message==='auth'?'관리자 로그인 후 다시 확인해 주세요.':lastSuccess?'새 현황을 불러오지 못했어요. 아래는 이전에 확인한 기록입니다. 새로고침으로 다시 시도해 주세요.':'운영 현황을 불러오지 못했어요. 새로고침으로 다시 시도해 주세요.';$('#operations-content').dataset.stale='true';$('#operations-status').textContent='';}
 finally{loading=false;button.setAttribute('aria-disabled','false');}
}
$('#operations-refresh').addEventListener('click',refresh);
refresh();
