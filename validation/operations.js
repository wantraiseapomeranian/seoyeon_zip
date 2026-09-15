const $=selector=>document.querySelector(selector);
const tabNames=['overview','collection','growth','alerts'];
const sectionTabs={'x-title':'collection','instagram-title':'collection','manual-title':'collection','growth-title':'growth','totals-title':'growth','alerts-title':'alerts'};
function selectTab(name,{focus=false,hash=true}={}){
 if(!tabNames.includes(name)||!$('#ops-tab-'+name))return;
 for(const key of tabNames){const selected=key===name,tab=$('#ops-tab-'+key);tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;$('#ops-panel-'+key).hidden=!selected;}
 if(hash)history.replaceState(null,'','#'+name);
 if(focus)$('#ops-tab-'+name).focus();
}
function followHash(){const name=location.hash.slice(1);selectTab(tabNames.includes(name)?name:sectionTabs[name]??'overview',{hash:false});}
document.querySelectorAll('[role="tab"]').forEach((tab,index)=>{
 tab.addEventListener('click',()=>selectTab(tabNames[index]));
 tab.addEventListener('keydown',event=>{
  const next=event.key==='ArrowRight'?(index+1)%tabNames.length:event.key==='ArrowLeft'?(index+tabNames.length-1)%tabNames.length:event.key==='Home'?0:event.key==='End'?tabNames.length-1:null;
  if(next!==null){event.preventDefault();selectTab(tabNames[next],{focus:true});}
 });
});
$('#operations-content').addEventListener('click',event=>{
 const link=event.target.closest('[data-panel-target]');if(!link)return;
 event.preventDefault();selectTab(link.dataset.panelTarget);
 const target=$(link.getAttribute('href'));
 if(target){target.tabIndex=-1;target.focus();}else $('#ops-tab-'+link.dataset.panelTarget).focus();
});
window.addEventListener('hashchange',followHash);followHash();
const statusNames={disabled:'중지됨',completed:'과거 수집 완료',unconfigured:'설정 필요',waiting:'첫 처리 대기',running:'처리 중',healthy:'정상',retry:'재시도 대기',attention:'확인 필요',delayed:'처리 지연'};
const needsAttention=status=>['retry','attention','delayed','unconfigured'].includes(status);
const count=value=>new Intl.NumberFormat('ko-KR').format(value)+'건';
const timestamp=value=>value?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value)):'기록 없음';
function node(tag,text,className){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;}
function values(target,entries){target.replaceChildren(...entries.map(([label,value])=>{const row=node('div');row.append(node('dt',label),node('dd',value));return row;}));}
function state(status){const el=node('span',statusNames[status]||'상태 확인 필요','ops-state');el.dataset.attention=String(needsAttention(status));return el;}
function renderAlerts(alerts){
 const active=alerts?.active??[],events=alerts?.events??[];
 $('#alerts-active').replaceChildren();$('#alerts-rows').replaceChildren();$('#alerts-details').hidden=!events.length;
 $('#alerts-status').classList.toggle('ops-warning',alerts?.status!=='ok'||!!alerts?.stale);
 if(alerts?.status!=='ok'){$('#alerts-status').textContent='알림 기록을 불러오지 못했어요. 새로고침으로 다시 확인해 주세요.';return;}
 if(!alerts.checkedAt)$('#alerts-status').textContent='알림 점검의 첫 확인을 기다리고 있어요.';
 else $('#alerts-status').textContent='마지막 점검 · '+timestamp(alerts.checkedAt)+' (한국시간) · '+(alerts.stale?'점검 기록이 15분 넘게 갱신되지 않았어요.':active.length?'진행 중인 문제 '+active.length+'개':'지속 중인 문제 알림이 없어요.');
 const href=key=>key.startsWith('x:')?'#x-title':key==='instagram'?'#instagram-title':key==='manual'?'#manual-title':'#growth-title';
 $('#alerts-active').replaceChildren(...active.map(item=>{
  const li=node('li'),link=node('a',item.label+' · 문제 지속');link.href=href(item.key);link.dataset.panelTarget=item.key==='history'?'growth':'collection';
  li.append(link,node('span','발생 확인 · '+timestamp(item.openedAt),'muted'));return li;
 }));
 const names={problem:'문제 발생',recovered:'복구 확인',stopped:'중지로 종료'};
 $('#alerts-rows').replaceChildren(...events.map(item=>{
  const tr=node('tr'),time=node('th',timestamp(item.createdAt));time.scope='row';tr.append(time,node('td',item.label),node('td',names[item.type]??'상태 변경'));return tr;
 }));
}
const number=value=>new Intl.NumberFormat('ko-KR',{maximumFractionDigits:2}).format(value);
const bytes=value=>value==null?'측정 없음':value>=1e6?number(value/1e6)+' MB':value>=1000?number(value/1000)+' KB':number(value)+' B';
const metric=(value,unit)=>value==null?'측정 없음':number(value)+unit;
function growthValue(value,change,format){return format(value)+(change==null?' · 전일 비교 없음':' · 전일 대비 '+(change>0?'+':change<0?'−':'')+format(Math.abs(change)));}
function renderGrowth(history,generatedAt){
 const items=history?.items??[],latest=items[0];
 $('#growth-details').hidden=!items.length;
 $('#growth-values').replaceChildren();$('#growth-query').replaceChildren();$('#growth-rows').replaceChildren();
 if(history?.status!=='ok'){$('#growth-status').textContent='추이 기록을 불러오지 못했어요. 새로고침으로 다시 확인해 주세요.';return;}
 if(!latest){$('#growth-status').textContent='첫 기록을 기다리고 있어요. 기록이 쌓이면 날짜별 변화가 표시됩니다.';return;}
 const today=new Date(Date.parse(generatedAt)+9*3600000).toISOString().slice(0,10);
 $('#growth-status').textContent='최근 기록 · '+timestamp(latest.capturedAt)+' (한국시간)'+(latest.day<today?' · 오늘 기록은 아직 없어요.':'')+(latest.query.status==='failed'?' · X 검토함 조회 측정에 실패했어요.':'');
 values($('#growth-values'),[['X 저장 게시물',growthValue(latest.totals.x,latest.delta?.x,count)],['인스타 검토 자료',growthValue(latest.totals.instagram,latest.delta?.instagram,count)],['직접 등록 자료',growthValue(latest.totals.manual,latest.delta?.manual,count)],['DB 크기',growthValue(latest.databaseBytes,latest.delta?.databaseBytes,bytes)]]);
 values($('#growth-query'),[['대표 조회 SQL 시간',metric(latest.query.sqlMs,' ms')],['대표 조회 읽은 행',metric(latest.query.rowsRead,'행')],['대표 조회 응답 크기',bytes(latest.query.resultBytes)]]);
 $('#growth-rows').replaceChildren(...items.map(item=>{
  const row=node('tr'),day=node('th',item.day);day.scope='row';day.title=timestamp(item.capturedAt);row.append(day);
  const query=item.query;
  for(const value of [count(item.totals.x),count(item.totals.instagram),count(item.totals.manual),bytes(item.databaseBytes),query.status==='failed'?'측정 실패':metric(query.sqlMs,' ms'),metric(query.rowsRead,'행'),bytes(query.resultBytes)])row.append(node('td',value));
  return row;
 }));
}
function render(data){
 renderAlerts(data.alerts);
 const alertSummary=data.alerts?.status!=='ok'?'확인 불가':!data.alerts.checkedAt?'첫 확인 대기':(data.alerts.stale?'점검 지연 · ':'')+data.alerts.active.length+'개';
 values($('#overview-values'),[['X 수집',data.x.enabled?'활성 계정 '+data.x.sources.filter(source=>source.enabled).length+'개':'중지됨'],['Instagram',statusNames[data.instagram.status]??'확인 필요'],['사진 조회 실패',data.manual.enabled?count(data.manual.counts.failed):'자동 조회 중지'],['지속 문제',alertSummary]]);
 const alertLink=node('a',alertSummary+' · 기록 보기','ops-link');alertLink.href='#alerts';alertLink.dataset.panelTarget='alerts';$('#overview-values').lastElementChild.querySelector('dd').replaceChildren(alertLink);
 const issues=[];
 for(const source of data.x.sources)if(needsAttention(source.status))issues.push({text:'X @'+source.source+' · '+statusNames[source.status],href:'/?manage=collection'});
 const ig=data.instagram;
 if(needsAttention(ig.status))issues.push({text:'Instagram · '+statusNames[ig.status],href:'/admin/instagram'});
 if(!['disabled','unconfigured'].includes(ig.status)&&ig.pendingErrors)issues.push({text:'Instagram 자료 처리 실패 '+count(ig.pendingErrors),href:'/admin/instagram'});
 if(!['disabled','unconfigured'].includes(ig.status)&&ig.overdue)issues.push({text:'Instagram 대기 작업 지연 '+count(ig.overdue),href:'/admin/instagram'});
 if(data.manual.enabled&&data.manual.counts.failed)issues.push({text:'직접 등록 사진 조회 실패 '+count(data.manual.counts.failed),href:'/?manage=tools'});
 if(data.manual.enabled&&data.manual.overdue)issues.push({text:'직접 등록 사진 조회 지연 '+count(data.manual.overdue),href:'/?manage=tools'});
 $('#attention-summary').textContent=issues.length?'아래 항목의 상태를 확인해 주세요.':'현재 기록에서 확인이 필요한 항목은 없어요.';
 $('#operations-issues').replaceChildren(...issues.map(issue=>{const li=node('li'),link=node('a',issue.text);link.href=issue.href.includes('instagram')?'#instagram-title':issue.href.includes('tools')?'#manual-title':'#x-title';link.dataset.panelTarget='collection';li.append(link);return li;}));
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
 renderGrowth(data.history,data.generatedAt);
 $('#operations-updated').textContent='마지막 확인 · '+timestamp(data.generatedAt)+' (한국시간)';
}
let loading=false,lastSuccess=false;
async function refresh(){
 if(loading)return;loading=true;const button=$('#operations-refresh');button.setAttribute('aria-disabled','true');$('#operations-status').textContent='운영 현황을 불러오고 있어요.';$('#operations-error').textContent='';
 try{
  const response=await fetch('/api/admin/operations',{cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(response.status===401||response.status===403){$('#operations-content').hidden=true;$('#operations-content').replaceChildren();$('#operations-login').hidden=false;$('#operations-updated').textContent='관리자 인증이 만료되었거나 접근 권한이 없어요.';button.hidden=true;lastSuccess=false;throw Error('auth');}
  if(!response.ok)throw Error('load');
  const data=await response.json();render(data);lastSuccess=true;$('#operations-content').hidden=false;$('#operations-content').dataset.stale='false';
  const unavailable=[];if(data.alerts?.status!=='ok')unavailable.push('운영 알림');if(data.history?.status!=='ok')unavailable.push('자료 증가');
  $('#operations-content').dataset.partial=String(unavailable.length>0);
  $('#operations-status').textContent=unavailable.length?'':'현황을 확인했어요.';
  $('#operations-error').textContent=unavailable.length?'일부 정보를 불러오지 못했어요: '+unavailable.join(', ')+'. 새로고침으로 다시 확인해 주세요.':'';
 }catch(error){$('#operations-error').textContent=error.message==='auth'?'관리자 로그인 후 다시 확인해 주세요.':lastSuccess?'새 현황을 불러오지 못했어요. 아래는 이전에 확인한 기록입니다. 새로고침으로 다시 시도해 주세요.':'운영 현황을 불러오지 못했어요. 새로고침으로 다시 시도해 주세요.';$('#operations-content').dataset.stale='true';$('#operations-status').textContent='';}
 finally{loading=false;button.setAttribute('aria-disabled','false');}
}
$('#operations-refresh').addEventListener('click',refresh);
refresh();
