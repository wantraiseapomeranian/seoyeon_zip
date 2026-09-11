// Official icon SVGs; licenses and sources: docs/icon-licenses/README.md
const iconSets={"phosphor":["<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 256 256\" fill=\"currentColor\"><path d=\"M224,48V96a8,8,0,0,1-8,8H168a8,8,0,0,1,0-16h28.69L182.06,73.37a79.56,79.56,0,0,0-56.13-23.43h-.45A79.52,79.52,0,0,0,69.59,72.71,8,8,0,0,1,58.41,61.27a96,96,0,0,1,135,.79L208,76.69V48a8,8,0,0,1,16,0ZM186.41,183.29a80,80,0,0,1-112.47-.66L59.31,168H88a8,8,0,0,0,0-16H40a8,8,0,0,0-8,8v48a8,8,0,0,0,16,0V179.31l14.63,14.63A95.43,95.43,0,0,0,130,222.06h.53a95.36,95.36,0,0,0,67.07-27.33,8,8,0,0,0-11.18-11.44Z\"/></svg>","<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 256 256\" fill=\"currentColor\"><path d=\"M224,128a8,8,0,0,1-8,8H128a8,8,0,0,1,0-16h88A8,8,0,0,1,224,128ZM128,72h88a8,8,0,0,0,0-16H128a8,8,0,0,0,0,16Zm88,112H128a8,8,0,0,0,0,16h88a8,8,0,0,0,0-16ZM82.34,42.34,56,68.69,45.66,58.34A8,8,0,0,0,34.34,69.66l16,16a8,8,0,0,0,11.32,0l32-32A8,8,0,0,0,82.34,42.34Zm0,64L56,132.69,45.66,122.34a8,8,0,0,0-11.32,11.32l16,16a8,8,0,0,0,11.32,0l32-32a8,8,0,0,0-11.32-11.32Zm0,64L56,196.69,45.66,186.34a8,8,0,0,0-11.32,11.32l16,16a8,8,0,0,0,11.32,0l32-32a8,8,0,0,0-11.32-11.32Z\"/></svg>"],"tabler":["<!--\ntags: [synchronization, reload, restart, spinner, loader, ajax, update, arrows, refresh, navigation]\ncategory: Arrows\nversion: \"1.0\"\nunicode: \"eb13\"\n-->\n<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4\" />\n  <path d=\"M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4\" />\n</svg>\n","<!--\ntags: [to-do, checklist, form, template, task, reminder, schedule, agenda, list, check]\ncategory: Text\nversion: \"1.2\"\nunicode: \"eb6a\"\n-->\n<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M3.5 5.5l1.5 1.5l2.5 -2.5\" />\n  <path d=\"M3.5 11.5l1.5 1.5l2.5 -2.5\" />\n  <path d=\"M3.5 17.5l1.5 1.5l2.5 -2.5\" />\n  <path d=\"M11 6l9 0\" />\n  <path d=\"M11 12l9 0\" />\n  <path d=\"M11 18l9 0\" />\n</svg>\n"],"lucide":["<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8\" />\n  <path d=\"M21 3v5h-5\" />\n  <path d=\"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16\" />\n  <path d=\"M8 16H3v5\" />\n</svg>\n","<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M13 5h8\" />\n  <path d=\"M13 12h8\" />\n  <path d=\"M13 19h8\" />\n  <path d=\"m3 17 2 2 4-4\" />\n  <path d=\"m3 7 2 2 4-4\" />\n</svg>\n"]};
const $=s=>document.querySelector(s);
// Public support address. Set only to an address approved for publication.
const contactEmail='wantraiseapomeranian9@gmail.com';
function openAbout(originalUrl=''){
 const target=$('#contact-target');target.hidden=!originalUrl;target.textContent=originalUrl?`대상 원문: ${originalUrl}`:'';
 $('#contact-feedback').textContent=contactEmail?'':'문의 이메일을 준비 중입니다.';
 $('#contact-actions').hidden=!contactEmail;
 if(contactEmail){
  $('#contact-address').textContent=contactEmail;
  const body=`대상 게시물 원문 링크: ${originalUrl}\n\n요청 내용 (게시 중단 / 출처 수정 / 기타):\n\n콘텐츠와의 관계:\n`;
  $('#contact-email').href=`mailto:${contactEmail}?subject=${encodeURIComponent('[서연모음.zip] 게시 중단·출처 수정 요청')}&body=${encodeURIComponent(body)}`;
 }
 $('#about-dialog').showModal();
}
$('#open-about').addEventListener('click',()=>openAbout());
$('#close-about').addEventListener('click',()=>$('#about-dialog').close());
$('#copy-contact').addEventListener('click',async()=>{
 try{await navigator.clipboard.writeText(contactEmail);$('#contact-feedback').textContent='이메일 주소를 복사했어요.';}
 catch{$('#contact-feedback').textContent='복사하지 못했어요. 표시된 이메일 주소를 직접 복사해 주세요.';}
});
const kinds={cosmo:'COSMO',fansite:'직찍',official:'공식',other:'기타'};
const params=new URLSearchParams(location.search);
const iconFamily='phosphor';
function applyIcons(){
 ['refresh','open-status'].forEach((id,index)=>{
  const button=document.getElementById(id);const label=index?'수집 상태':'목록 새로고침';
  const svg=new DOMParser().parseFromString(iconSets[iconFamily][index],'image/svg+xml').documentElement;
  svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');
  button.classList.add('icon-button');button.setAttribute('aria-label',label);
  button.replaceChildren(document.importNode(svg,true),node('span','icon-tooltip',label));
 });
}
applyIcons();
const mood='zine';
document.body.dataset.mood=mood;
document.body.dataset.background='mist';
let media=['all','image','video'].includes(params.get('media'))?params.get('media'):'all';
let posts=[],states=[],collectedAt=null,loaded=false,role='visitor',roleGeneration=0;
const live=!['127.0.0.1','localhost'].includes(location.hostname)||params.get('data')==='live';
let nextCursor=null,total=0,requestVersion=0;
const sourceEndpoint=()=>role==='owner'?'/api/sources':'/api/collection-status';
const more=node('button',null,'더 보기');more.id='load-more';more.hidden=true;$('#gallery').after(more);
more.addEventListener('click',()=>{if(more.getAttribute('aria-disabled')!=='true')loadLive(true);});
const appendStatus=node('p','sr-only');appendStatus.setAttribute('role','status');more.after(appendStatus);
if(live){$('#range').textContent='저장된 게시물을 표시해요. 목록 새로고침은 수집을 실행하지 않아요.';$('#count').title='선택한 조건에 맞는 전체 저장 게시물 수';$('#updated').title='수집 데이터가 마지막으로 저장된 시각입니다.';}
const stamp=value=>value?new Date(value).toLocaleString('ko-KR',{month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'}):'아직 저장 기록 없음';
function node(tag,className,text){const e=document.createElement(tag);if(className)e.className=className;if(text!=null)e.textContent=text;return e;}
function applyRole(){
 const owner=role==='owner';$('.review-entry').hidden=!owner;$('#login-link').hidden=owner;$('.management-tabs').hidden=!owner;$('#tools-tab').hidden=!owner;$('#manual-form').hidden=!owner;
 $('#status-title').textContent=owner?'수집 및 관리':'수집 현황';$('.collection-note').hidden=!owner;
 if(owner){$('#collection-panel').setAttribute('role','tabpanel');$('#collection-panel').setAttribute('aria-labelledby','collection-tab');}
 else{$('#collection-panel').setAttribute('role','region');$('#collection-panel').setAttribute('aria-labelledby','status-title');$('#tools-panel').hidden=true;$('#manual-url').value='';$('#management-message').textContent='';selectManagementTab($('#collection-tab'));}
}
function setRole(next){if(next===role)return false;role=next;roleGeneration++;states=[];applyRole();renderSources();return true;}
function demote(){setRole('visitor');$('#status-message').textContent='관리자 로그인이 필요해요.';refreshSources({preserveMessage:true});}
async function detectRole(){
 const generation=roleGeneration;
 try{const response=await fetch('/api/session');if(!response.ok)throw Error('session');const data=await response.json();if(generation!==roleGeneration)return;if(data.role==='owner'&&setRole('owner'))refreshSources();}
 catch{setRole('visitor');}
}
async function fetchSourceState(){
 const generation=roleGeneration,endpoint=sourceEndpoint(),admin=role==='owner';const response=await fetch(endpoint);
 if(admin&&(response.status===401||response.status===403)){if(generation===roleGeneration)demote();throw Error('auth');}
 if(!response.ok)throw Error('status');const data=await response.json();if(!Array.isArray(data.sources))throw Error('shape');
 if(generation!==roleGeneration||endpoint!==sourceEndpoint())throw Error('stale');return data.sources;
}
function syncUrl(){const q=new URLSearchParams();if(['127.0.0.1','localhost'].includes(location.hostname)&&params.get('data')==='live')q.set('data','live');if($("#month").value)q.set("date",$("#month").value);if($("#sort").value==="oldest")q.set("sort","oldest");if(media!=='all')q.set('media',media);if($('#kind').value!=='all')q.set('kind',$('#kind').value);if($('#source').value!=='all')q.set('source',$('#source').value);const query=q.toString();history.replaceState(null,'',`/${query?'?'+query:''}${location.hash}`);}
function displayCaption(text){
 const repeated=new Set();const contextTags=new Set(['triples','트리플에스','윤서연','seoyeon','서연','ソヨン']);
 return text.replace(/(^|\s)#([\p{L}\p{N}_]+)/gu,(match,space,tag)=>{
  const key=tag.normalize('NFKC').toLowerCase();
  if(contextTags.has(key)||repeated.has(key))return space;
  repeated.add(key);return match;
 }).replace(/[ \t]+/g,' ').replace(/ *\n */g,'\n').replace(/\n{3,}/g,'\n\n').trim();
}
let feedViewers=[];const photoPositions=new Map();
function clearViewers(){for(const v of feedViewers)v.destroy();feedViewers=[];}
function smallPreview(value){try{const u=new URL(value);if(u.origin==='https://pbs.twimg.com'){u.searchParams.set('name','small');return u.href;}}catch{}return value;}
function feedAction(tag,className,label,path){
 const control=node(tag,`${className} icon-button`);control.setAttribute('aria-label',label);
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 256 256');svg.setAttribute('fill','currentColor');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');
 const shape=document.createElementNS(svg.namespaceURI,'path');shape.setAttribute('d',path);svg.append(shape);
 const tooltip=node('span','icon-tooltip',label);tooltip.setAttribute('aria-hidden','true');control.append(svg,tooltip);return control;
}
function card(post){
 const article=node('article','card');article.dataset.id=post.id;article.dataset.date=post.publishedAt;
 const video=post.media.some(m=>m.kind==='video'||m.kind==='gif');const photos=post.media.filter(m=>m.kind==='image').length;
 const first=post.media[0];
 if(post.manual){const link=node('a','manual-preview',post.platform==='instagram'?'Instagram 원문 보기 ↗':'X 원문 보기 ↗');link.href=post.canonicalUrl;link.target='_blank';link.rel='noopener noreferrer';article.append(link);}else{
 const viewer=window.reviewGallery(post.media.map(m=>({src:smallPreview(m.previewUrl),originalSrc:m.previewUrl,url:post.canonicalUrl,kind:m.kind,alt:post.authorHandle+(m.kind==='image'?' 사진':m.kind==='unknown'?' 미리보기':' 영상 미리보기')})),{label:'피드 사진',managed:true,onChange:i=>photoPositions.set(post.id,i)});
 viewer.element.classList.add('feed-gallery');viewer.element.style.setProperty('--photo-ratio',first.width&&first.height?String(first.width/first.height):'0.75');viewer.select(photoPositions.get(post.id)??0,false);feedViewers.push(viewer);article.append(viewer.element);}

 const actions=node('div','feed-actions');
 if(video){const hint=node('span','via');hint.append(node('span','video-hint-prefix','영상은 '),document.createTextNode('원문에서 재생'));actions.append(hint);}
 const controls=node('div','feed-action-controls');
 const original=feedAction('a','feed-original','원문 보기','M224,104a8,8,0,0,1-16,0V59.32l-66.33,66.34a8,8,0,0,1-11.32-11.32L196.68,48H152a8,8,0,0,1,0-16h64a8,8,0,0,1,8,8Zm-40,24a8,8,0,0,0-8,8v72H48V80h72a8,8,0,0,0,0-16H48A16,16,0,0,0,32,80V208a16,16,0,0,0,16,16H176a16,16,0,0,0,16-16V136A8,8,0,0,0,184,128Z');original.href=post.canonicalUrl;original.target='_blank';original.rel='noopener noreferrer';controls.append(original);
 const request=feedAction('button','rights-request','수정·삭제 요청','M168,112a8,8,0,0,1-8,8H96a8,8,0,0,1,0-16h64A8,8,0,0,1,168,112Zm-8,24H96a8,8,0,0,0,0,16h64a8,8,0,0,0,0-16Zm72-8A104,104,0,0,1,79.12,219.82L45.07,231.17a16,16,0,0,1-20.24-20.24l11.35-34.05A104,104,0,1,1,232,128Zm-16,0A88,88,0,1,0,51.81,172.06a8,8,0,0,1,.66,6.54L40,216,77.4,203.53a7.85,7.85,0,0,1,2.53-.42,8,8,0,0,1,4,1.08A88,88,0,0,0,216,128Z');request.type='button';request.setAttribute('aria-haspopup','dialog');request.setAttribute('aria-controls','about-dialog');request.addEventListener('click',()=>openAbout(post.canonicalUrl));controls.append(request);actions.append(controls);article.append(actions);
 const meta=node('div','card-meta');meta.append(node('span','author',post.authorHandle?`@${post.authorHandle}`:'직접 등록'),node('span','category',post.platform==='instagram'?'Instagram':(kinds[post.contentKind]||'기타')));article.append(meta);const time=node('time',null,(post.dateEstimated?(post.manual?'등록일 · ':'가져온 날짜 · '):'')+stamp(post.publishedAt));time.dateTime=post.publishedAt;article.append(time);
 const caption=displayCaption(post.caption);if(caption)article.append(node('p','caption',caption));
 if(!post.manual&&post.platform!=='instagram'&&post.authorHandle.toLowerCase()!==post.observedViaSource.toLowerCase())article.append(node('span','via',`발견 출처 @${post.observedViaSource}`));for(const source of post.duplicateSources||[]){const a=node('a','via','같은 사진 출처 @'+source.author);a.href=source.url;a.target='_blank';a.rel='noopener noreferrer';article.append(a);}return article;
}
function render(){
 clearViewers();
 const activeFilters=Number($('#kind').value!=='all')+Number($('#source').value!=='all');
 $('#filter-toggle').textContent=activeFilters?`필터 · ${activeFilters}`:'필터';
 document.querySelectorAll('[data-sort]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.sort===$('#sort').value)));
 document.querySelectorAll('[data-media]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.media===media)));
 const month=$('#month').value;
 $('#clear-month').hidden=!month;
 const monthDescription=month?`${month.slice(0,4)}년 ${Number(month.slice(5,7))}월 ${Number(month.slice(8))}일 선택됨`:'전체 기간';
 $('#month-trigger').setAttribute('aria-label',`게시일 선택 · ${monthDescription}`);
 $('#month-trigger').dataset.active=String(Boolean(month));
 $('#month-trigger .icon-tooltip').textContent=`게시일 선택 · ${monthDescription}`;
 const selected=live?[...posts]:posts.filter(p=>(!month||new Date(p.publishedAt).toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'})===month)&&(media==='all'||p.media.some(m=>media==='video'?['video','gif'].includes(m.kind):m.kind==='image'))&&($('#kind').value==='all'||p.contentKind===$('#kind').value)&&($('#source').value==='all'||p.observedViaSource===$('#source').value));
 const direction=$('#sort').value==='oldest'?1:-1;
 selected.sort((a,b)=>direction*(Date.parse(a.publishedAt)-Date.parse(b.publishedAt))||a.id.localeCompare(b.id));
 const elements=[];let previousDay=null;
 for(const post of selected){
  const day=new Date(post.publishedAt).toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'});
  if(mood==='zine'&&day!==previousDay){const heading=node('h2','day-heading');heading.append(node('span',null,day.replaceAll('-','.')),node('span','day-note','게시일'));elements.push(heading);previousDay=day;}
  const item=card(post);
  if(mood==='album'||mood==='archive'){
   const time=item.querySelector('time');time.textContent=new Date(post.publishedAt).toLocaleDateString('ko-KR',{year:'numeric',month:'2-digit',day:'2-digit'});
  }
  elements.push(item);
 }
 $('#gallery').replaceChildren(...elements);$('#empty').hidden=selected.length>0||!loaded;$('#count').textContent=`${selected.length}개 게시물`;
 $('#empty h2').textContent=posts.length?'이 조건에 맞는 게시물이 없어요.':'아직 모인 게시물이 없어요.';$('#empty p').textContent=posts.length?'다른 종류나 출처를 골라보세요.':'수집 상태에서 연결된 출처를 확인해 주세요.';
 $('#updated').textContent=`마지막 갱신 · ${stamp(collectedAt)}`;
 $('#gallery').setAttribute('aria-label',$('#sort').value==='oldest'?'오래된순 게시물':'최신순 게시물');
 if(live){$('#count').textContent=`${total}개 게시물`;more.hidden=!nextCursor;$('#empty h2').textContent='이 조건에 맞는 게시물이 없어요.';$('#empty p').textContent='다른 조건을 선택하거나 수집 상태를 확인해 주세요.';}
}
async function loadLive(append=false){
 const version=++requestVersion;syncUrl();const query=new URLSearchParams(location.search);
 if(append&&nextCursor)query.set('cursor',nextCursor);
 $('#refresh').disabled=true;more.setAttribute('aria-disabled','true');appendStatus.textContent='';$('#notice').textContent='';$('#gallery').setAttribute('aria-busy','true');
 if(!append){clearViewers();photoPositions.clear();posts=[];loaded=false;nextCursor=null;more.hidden=true;$('#empty').hidden=true;$('#count').textContent='불러오는 중…';$('#gallery').replaceChildren(...Array.from({length:6},()=>{const e=node('div','skeleton');e.setAttribute('aria-hidden','true');return e;}));}
 try{
  const response=await fetch(`/api/feed?${query}`);if(!response.ok)throw Error(response.status===401||response.status===403?'auth':'feed');
  const data=await response.json();if(!Array.isArray(data.posts))throw Error('shape');if(version!==requestVersion)return;
  const known=new Set(posts.map(p=>p.id)),added=data.posts.filter(p=>!known.has(p.id));
  const continueFromMore=append&&document.activeElement===more;
  posts.push(...added);total=data.total;nextCursor=data.nextCursor;collectedAt=data.collectedAt;loaded=true;render();
  if(append){
   appendStatus.textContent=`게시물 ${added.length}개를 추가로 불러왔어요.${nextCursor?'':' 마지막 게시물이에요.'}`;
   if(continueFromMore){
    const cards=[...$('#gallery').querySelectorAll('.card')];
    const target=cards.find(e=>!known.has(e.dataset.id))||(more.hidden?cards.at(-1):more);
    if(target){if(target!==more)target.tabIndex=-1;target.focus();}
   }
  }
  try{const nextStates=await fetchSourceState();if(version!==requestVersion)return;states=nextStates;
   const current=$('#source').value;const names=new Set(['instagram','manual',...states.map(s=>s.source)]);if(current!=='all')names.add(current);
   $('#source').replaceChildren(new Option('모든 출처','all'),...[...names].sort().map(s=>new Option(s==='instagram'?'Instagram':s==='manual'?'직접 등록':`@${s}`,s)));$('#source').value=current;renderSources();
   if(states.some(sourceHasError))$('#notice').textContent='일부 출처의 갱신이 지연되고 있어요. 수집 상태를 확인해 주세요.';
  }catch(error){if(version===requestVersion&&error.message!=='stale'&&error.message!=='auth'){states=[];renderSources();$('#notice').textContent='게시물은 불러왔지만 수집 상태는 확인하지 못했어요.';}}
 }catch(error){if(version!==requestVersion)return;if(!append){$('#gallery').replaceChildren();$('#count').textContent='목록 조회 실패';}$('#notice').textContent=error.message==='auth'?'로그인이 만료됐어요. 페이지를 새로고침해 로그인해 주세요.':'목록을 불러오지 못했어요. 다시 시도해 주세요.';}
  finally{if(version===requestVersion){$('#refresh').disabled=false;more.removeAttribute('aria-disabled');$('#gallery').setAttribute('aria-busy','false');}}
}
function changeFilters(){if(live){posts=[];loaded=false;render();loadLive();}else{render();syncUrl();}}
const historyNotes=new Set(['history_window_unverified','unverified_exhaustion','repeated_cursor']);
const sourceHasError=s=>s.state==='attention'||s.catchup_status==='needs_attention'||!!s.last_error_code&&!historyNotes.has(s.last_error_code);
function renderSources(){
 const host=$('#source-status');const focused=document.activeElement?.dataset.source;const expanded=new Set([...host.querySelectorAll('details[open]')].map(d=>d.dataset.source));host.replaceChildren();
 if(!states.length){host.append(node('p','muted','수집 상태를 확인하지 못했어요. 상태 새로고침으로 다시 시도해 주세요.'));return;}
 for(const s of states){
  if(role!=='owner'){
   const labels={paused:'수집 중지',waiting:'첫 수집 대기',ok:'수집 성공',attention:'확인 필요'};const row=node('section','source-row'),heading=node('div','source-heading');
   heading.append(node('strong',null,`@${s.source}`),node('span',s.state==='attention'?'source-state warning':'source-state',labels[s.state]||'상태 확인'));row.append(heading,node('p','source-last',s.lastSuccessAt?'마지막 성공 · '+stamp(s.lastSuccessAt):'아직 수집 기록 없음'));host.append(row);continue;
  }
  const paused=!s.enabled||s.collection_enabled===false||s.collection_enabled===0;
  const attention=s.catchup_status==='needs_attention';
  const historyNote=historyNotes.has(s.last_error_code),error=sourceHasError(s);
  const text=paused?'수집 중지':attention?'확인 필요':error?'재시도 대기':!s.last_success_at?'첫 수집 대기':historyNote?'최신 수집 정상':'수집 성공';
  const row=node('section','source-row'),heading=node('div','source-heading');
  heading.append(node('strong',null,`@${s.source}`),node('span',!paused&&error?'source-state warning':'source-state',text));row.append(heading);
  const toggle=node('button','source-toggle',s.enabled?'중지':'켜기');toggle.dataset.source=s.source;toggle.setAttribute('aria-label',s.source+' '+(s.enabled?'수집 중지':'수집 켜기'));toggle.disabled=!live||(!s.enabled&&!s.collection_enabled);heading.append(toggle);
  const feedback=node('p','source-feedback');feedback.setAttribute('role','status');
  toggle.onclick=async()=>{const hadFocus=document.activeElement===toggle;toggle.disabled=true;let message;try{await management('/api/sources/'+s.source,{enabled:!s.enabled,revision:s.revision},'PATCH');message=s.enabled?'수집 중지 · 저장된 글은 유지됩니다.':'수집 재개 · 기존 대기 순서로 진행합니다.';}catch(e){message=e.message;}finally{toggle.disabled=false;}const restore=hadFocus&&(document.activeElement===toggle||document.activeElement===document.body);await refreshSources();const current=[...host.querySelectorAll('.source-toggle')].find(b=>b.dataset.source===s.source);if(current){current.closest('.source-row').querySelector('.source-feedback').textContent=message;if(restore&&(document.activeElement===document.body||document.activeElement===toggle))current.focus({preventScroll:true});}};
  const detail=node('details','source-detail');detail.dataset.source=s.source;detail.open=expanded.has(s.source);detail.append(node('summary',null,'상세'));row.append(node('p','source-last',s.last_success_at?'마지막 성공 · '+stamp(s.last_success_at*1000):'아직 수집 기록 없음'),feedback,detail);
  if(s.last_success_at){
   detail.append(node('p',null,`마지막 성공 · ${stamp(s.last_success_at*1000)}`));
   if(Number.isInteger(s.last_received_count)&&Number.isInteger(s.last_matched_count)){
    detail.append(node('p','source-result',`마지막 성공 페이지 · 응답 ${s.last_received_count}개 / 조건 통과 ${s.last_matched_count}개`));
    if(s.last_review_count>0)detail.append(node('p',null,`공식 검토 보류 ${s.last_review_count}개 · 피드에는 표시되지 않아요.`));
    else if(s.last_matched_count===0)detail.append(node('p',null,'이 페이지에는 수집 조건과 기간에 맞는 게시물이 없었어요.'));
   }else detail.append(node('p',null,'상세 건수는 다음 수집 성공부터 표시해요.'));
  }else detail.append(node('p',null,'아직 수집 성공 기록이 없어요.'));
  if(historyNote&&!error){
   row.append(node('p','source-last','과거 수집 범위 미확인'));
   detail.append(node('p',null,'과거 자료를 모두 가져왔는지 확인되지 않아 과거 조회를 멈췄어요.'+(paused?'':' 최신 글은 계속 확인해요.')));
  }else if(s.last_error_code){
   const code=s.last_error_code;
   const reason=code.includes('429')?'요청 한도에 도달했어요.':code.includes('timeout')?'응답 대기 시간이 초과됐어요.':code.includes('network')?'수집 서버에 연결하지 못했어요.':/401|403/.test(code)?'수집 서버가 접근을 거부했어요.':'수집 중 오류가 발생했어요.';
   row.append(node('p','source-error',reason+(paused?' 수집이 중지되어 있어요.':attention?' 설정 확인이 필요해요.':' 자동으로 다시 시도해요.')));
   const details=node('details');details.append(node('summary',null,'오류 상세'),node('code',null,code));detail.append(details);
  }
  if(!paused&&!attention&&s.next_due_at)detail.append(node('p',null,(s.next_due_at*1000<=Date.now()?'실행 순서 대기 · ':'다음 조회 가능 · ')+stamp(s.next_due_at*1000)));
  host.append(row);if(focused===s.source)toggle.focus({preventScroll:true});
 }
}
async function refreshSources(options={}){
 const button=$('#refresh-status');button.disabled=true;if(!options.preserveMessage)$('#status-message').textContent='상태를 불러오는 중…';
 try{
  states=await fetchSourceState();renderSources();if(role==='owner'&&(!$('#notice').textContent||$('#notice').textContent==='일부 출처의 갱신이 지연되고 있어요. 수집 상태를 확인해 주세요.'))$('#notice').textContent=states.some(sourceHasError)?'일부 출처의 갱신이 지연되고 있어요. 수집 상태를 확인해 주세요.':'';if(!options.preserveMessage)$('#status-message').textContent=live?'갱신 '+new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false}):'로컬 저장본이에요. 실제 운영 상태와 다를 수 있어요.';
 }catch(error){if(error.message!=='auth'&&error.message!=='stale')$('#status-message').textContent='상태 조회에 실패했어요. 다시 시도해 주세요. 아래는 이전 조회 결과예요.';}
 finally{button.disabled=false;}
}
async function load(){
 if(live)return loadLive();
 $('#refresh').disabled=true;$('#notice').textContent='';
 if(!loaded)$('#gallery').replaceChildren(...Array.from({length:6},()=>{const e=node('div','skeleton');e.setAttribute('aria-hidden','true');return e;}));
 try{const response=await fetch('/api/samples');if(!response.ok)throw Error('feed');const data=await response.json();if(!Array.isArray(data.posts))throw Error('shape');posts=[...data.posts].sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt)||a.id.localeCompare(b.id));collectedAt=data.collectedAt;loaded=true;
 const current=$('#source').value;const known=new Set(['instagram','manual',...posts.map(p=>p.observedViaSource)]);try{states=await fetchSourceState();states.forEach(s=>known.add(s.source));}catch(error){if(error.message==='stale'||error.message==='auth')return;states=[];$('#notice').textContent='게시물은 불러왔지만 수집 상태는 확인하지 못했어요.';}
 $('#source').replaceChildren(new Option('모든 출처','all'),...[...known].sort().map(s=>new Option(s==='instagram'?'Instagram':s==='manual'?'직접 등록':`@${s}`,s)));const requested=loadedOnce?current:params.get('source');if(known.has(requested))$('#source').value=requested;loadedOnce=true;
 if(states.some(sourceHasError))$('#notice').textContent='일부 출처의 갱신이 지연되고 있어요. 수집 상태를 확인해 주세요.';
 render();renderSources();syncUrl();
 }catch{if(!loaded){$('#gallery').replaceChildren();$('#count').textContent='목록 조회 실패';}$('#notice').textContent='목록을 불러오지 못했어요. 목록 새로고침으로 다시 시도해 주세요.';}finally{$('#refresh').disabled=false;}
}
let loadedOnce=false;
if(live && /^[A-Za-z0-9_]{1,15}$/.test(params.get('source')||'')){const source=params.get('source');document.querySelector('#source').append(new Option('@'+source,source));document.querySelector('#source').value=source;}
$('#filter-toggle').addEventListener('click',()=>{const open=$('#filter-toggle').getAttribute('aria-expanded')!=='true';$('#filter-toggle').setAttribute('aria-expanded',String(open));$('.filters').dataset.open=String(open);});
if(Object.hasOwn(kinds,params.get('kind')))$('#kind').value=params.get('kind');
if(params.get('sort')==='oldest')$('#sort').value='oldest';
document.querySelectorAll('[data-sort]').forEach(b=>b.addEventListener('click',()=>{$('#sort').value=b.dataset.sort;changeFilters();}));
if(/^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(params.get('date')||''))$('#month').value=params.get('date');
$('#month').addEventListener('change',()=>{changeFilters();});
$('#clear-month').addEventListener('click',()=>{$('#month').value='';changeFilters();$('#month').focus();});
function closeMonth(focus=false){$('#month-panel').hidden=true;$('#month-trigger').setAttribute('aria-expanded','false');if(focus)$('#month-trigger').focus();}
$('#month-trigger').addEventListener('click',()=>{const open=$('#month-panel').hidden;$('#month-panel').hidden=!open;$('#month-trigger').setAttribute('aria-expanded',String(open));if(open)$('#month').focus();});
document.addEventListener('click',event=>{if(!event.target.closest('.month-filter'))closeMonth();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('#month-panel').hidden){event.preventDefault();closeMonth(true);}});
$('.month-filter').addEventListener('focusout',event=>{if(!event.currentTarget.contains(event.relatedTarget))closeMonth();});
document.querySelectorAll('[data-media]').forEach(b=>b.addEventListener('click',()=>{media=b.dataset.media;changeFilters();}));
for(const id of ['#kind','#source'])$(id).addEventListener('change',()=>{changeFilters();});$('#reset').addEventListener('click',()=>{media='all';$("#month").value='';$('#kind').value='all';$('#source').value='all';changeFilters();});$('#refresh').addEventListener('click',load);$('#open-status').addEventListener('click',()=>{$('#source-dialog').showModal();refreshSources();});$('#refresh-status').addEventListener('click',refreshSources);$('#close-status').addEventListener('click',()=>$('#source-dialog').close());
load();

async function management(path,body,method='POST'){const response=await fetch(path,{method,headers:{'Content-Type':'application/json','X-Management-Action':'manage'},body:JSON.stringify(body)});if(!response.ok){if(response.status===401||response.status===403){demote();throw Error('관리자 로그인이 필요해요.');}const messages={400:'X 또는 인스타 게시물 URL과 입력값을 확인해 주세요.',409:'수집 상태가 바뀌었거나 전체 수집이 중지돼 있어요. 상태를 확인하고 다시 시도해 주세요.'};throw Error(messages[response.status]||'저장하지 못했어요. 잠시 후 다시 시도해 주세요.');}return response.json();}
$('#manual-form').addEventListener('submit',async e=>{e.preventDefault();const button=$('#manual-submit');button.disabled=true;try{const result=await management('/api/manual-posts',{url:$('#manual-url').value});$('#management-message').textContent=result.existing?'이미 저장된 게시물이에요. 검토 상태와 필터에 따라 피드에 표시돼요.':'원문 링크를 등록했어요.';$('#manual-url').value='';if(!result.existing)await load();}catch(error){$('#management-message').textContent=error.message;}finally{button.disabled=false;}});

const managementTabs=[...document.querySelectorAll('.management-tabs [role=tab]')];
function selectManagementTab(tab){managementTabs.forEach(t=>{const active=t===tab;t.setAttribute('aria-selected',String(active));t.tabIndex=active?0:-1;document.getElementById(t.getAttribute('aria-controls')).hidden=!active;});$('.management-body').scrollTop=0;}
managementTabs.forEach((tab,index)=>{tab.addEventListener('click',()=>selectManagementTab(tab));tab.addEventListener('keydown',event=>{let next;if(event.key==='ArrowRight'||event.key==='ArrowLeft')next=managementTabs[1-index];if(event.key==='Home')next=managementTabs[0];if(event.key==='End')next=managementTabs[1];if(next){event.preventDefault();selectManagementTab(next);next.focus();}});});
applyRole();detectRole();
