// Official icon SVGs; licenses and sources: docs/icon-licenses/README.md
const iconSets={"phosphor":["<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 256 256\" fill=\"currentColor\"><path d=\"M224,48V96a8,8,0,0,1-8,8H168a8,8,0,0,1,0-16h28.69L182.06,73.37a79.56,79.56,0,0,0-56.13-23.43h-.45A79.52,79.52,0,0,0,69.59,72.71,8,8,0,0,1,58.41,61.27a96,96,0,0,1,135,.79L208,76.69V48a8,8,0,0,1,16,0ZM186.41,183.29a80,80,0,0,1-112.47-.66L59.31,168H88a8,8,0,0,0,0-16H40a8,8,0,0,0-8,8v48a8,8,0,0,0,16,0V179.31l14.63,14.63A95.43,95.43,0,0,0,130,222.06h.53a95.36,95.36,0,0,0,67.07-27.33,8,8,0,0,0-11.18-11.44Z\"/></svg>","<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 256 256\" fill=\"currentColor\"><path d=\"M224,128a8,8,0,0,1-8,8H128a8,8,0,0,1,0-16h88A8,8,0,0,1,224,128ZM128,72h88a8,8,0,0,0,0-16H128a8,8,0,0,0,0,16Zm88,112H128a8,8,0,0,0,0,16h88a8,8,0,0,0,0-16ZM82.34,42.34,56,68.69,45.66,58.34A8,8,0,0,0,34.34,69.66l16,16a8,8,0,0,0,11.32,0l32-32A8,8,0,0,0,82.34,42.34Zm0,64L56,132.69,45.66,122.34a8,8,0,0,0-11.32,11.32l16,16a8,8,0,0,0,11.32,0l32-32a8,8,0,0,0-11.32-11.32Zm0,64L56,196.69,45.66,186.34a8,8,0,0,0-11.32,11.32l16,16a8,8,0,0,0,11.32,0l32-32a8,8,0,0,0-11.32-11.32Z\"/></svg>"],"tabler":["<!--\ntags: [synchronization, reload, restart, spinner, loader, ajax, update, arrows, refresh, navigation]\ncategory: Arrows\nversion: \"1.0\"\nunicode: \"eb13\"\n-->\n<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4\" />\n  <path d=\"M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4\" />\n</svg>\n","<!--\ntags: [to-do, checklist, form, template, task, reminder, schedule, agenda, list, check]\ncategory: Text\nversion: \"1.2\"\nunicode: \"eb6a\"\n-->\n<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M3.5 5.5l1.5 1.5l2.5 -2.5\" />\n  <path d=\"M3.5 11.5l1.5 1.5l2.5 -2.5\" />\n  <path d=\"M3.5 17.5l1.5 1.5l2.5 -2.5\" />\n  <path d=\"M11 6l9 0\" />\n  <path d=\"M11 12l9 0\" />\n  <path d=\"M11 18l9 0\" />\n</svg>\n"],"lucide":["<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8\" />\n  <path d=\"M21 3v5h-5\" />\n  <path d=\"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16\" />\n  <path d=\"M8 16H3v5\" />\n</svg>\n","<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M13 5h8\" />\n  <path d=\"M13 12h8\" />\n  <path d=\"M13 19h8\" />\n  <path d=\"m3 17 2 2 4-4\" />\n  <path d=\"m3 7 2 2 4-4\" />\n</svg>\n"]};
const $=s=>document.querySelector(s);
const kinds={cosmo:'COSMO',fansite:'직찍',official:'공식',other:'기타'};
const params=new URLSearchParams(location.search);
let iconFamily=Object.hasOwn(iconSets,params.get('icons'))?params.get('icons'):'phosphor';
function applyIcons(){
 ['refresh','open-status'].forEach((id,index)=>{
  const button=document.getElementById(id);const label=index?'수집 상태':'목록 새로고침';
  const svg=new DOMParser().parseFromString(iconSets[iconFamily][index],'image/svg+xml').documentElement;
  svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');
  button.classList.add('icon-button');button.setAttribute('aria-label',label);
  button.replaceChildren(document.importNode(svg,true),node('span','icon-tooltip',label));
 });
}
if(iconFamily){
 const nav=node('nav','mood-picker icon-picker');nav.hidden=params.get('compare')!=='icons';nav.setAttribute('aria-label','아이콘 비교');
 for(const [key,label] of Object.entries({phosphor:'Phosphor',lucide:'Lucide',tabler:'Tabler'})){
  const button=node('button',null,label);button.dataset.icons=key;button.setAttribute('aria-pressed',String(key===iconFamily));
  button.addEventListener('click',()=>{iconFamily=key;applyIcons();nav.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.icons===key)));syncUrl();});nav.append(button);
 }
 document.body.prepend(nav);applyIcons();
}
const moods={album:'개인 사진집',archive:'디지털 수집함',zine:'작은 팬진'};
let mood=Object.hasOwn(moods,params.get('mood'))?params.get('mood'):'zine';
document.body.dataset.mood=mood||'';
const backgrounds={paper:'종이빛',mist:'회청색',white:'흰색'};
let background=Object.hasOwn(backgrounds,params.get('background'))?params.get('background'):'mist';
if(background)document.body.dataset.background=background;
if(background&&!iconFamily){
 const nav=node('nav','mood-picker background-picker');nav.setAttribute('aria-label','팬진 배경 비교');
 for(const [key,label] of Object.entries(backgrounds)){const button=node('button',null,label);button.dataset.background=key;button.setAttribute('aria-pressed',String(key===background));button.addEventListener('click',()=>{background=key;document.body.dataset.background=key;nav.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.background===key)));syncUrl();});nav.append(button);}
 document.body.prepend(nav);
}
if(mood&&!background&&!iconFamily){
 const nav=node('nav','mood-picker');nav.setAttribute('aria-label','디자인 방향 비교');
 for(const [key,label] of Object.entries(moods)){const button=node('button',null,label);button.dataset.mood=key;button.setAttribute('aria-pressed',String(key===mood));button.addEventListener('click',()=>{mood=key;document.body.dataset.mood=key;nav.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mood===key)));render();syncUrl();});nav.append(button);}
 document.body.prepend(nav);
}
let media=['all','image','video'].includes(params.get('media'))?params.get('media'):'all';
let posts=[],states=[],collectedAt=null,loaded=false;
const live=!['127.0.0.1','localhost'].includes(location.hostname)||params.get('data')==='live';
let nextCursor=null,total=0,requestVersion=0;
const more=node('button',null,'더 보기');more.id='load-more';more.hidden=true;$('#gallery').after(more);
more.addEventListener('click',()=>loadLive(true));
if(live){$('#range').textContent='저장된 게시물을 표시해요. 목록 새로고침은 수집을 실행하지 않아요.';$('#count').title='선택한 조건에 맞는 전체 저장 게시물 수';$('#updated').title='수집 데이터가 마지막으로 저장된 시각입니다.';}
const stamp=value=>value?new Date(value).toLocaleString('ko-KR',{month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'}):'아직 저장 기록 없음';
function node(tag,className,text){const e=document.createElement(tag);if(className)e.className=className;if(text!=null)e.textContent=text;return e;}
function syncUrl(){const q=new URLSearchParams();if(params.get('data')==='live')q.set('data','live');if($("#month").value)q.set("month",$("#month").value);if($("#sort").value==="oldest")q.set("sort","oldest");q.set('layout',document.body.dataset.layout);if(mood)q.set('mood',mood);if(iconFamily)q.set('icons',iconFamily);if(background)q.set('background',background);if(media!=='all')q.set('media',media);if($('#kind').value!=='all')q.set('kind',$('#kind').value);if($('#source').value!=='all')q.set('source',$('#source').value);history.replaceState(null,'',`${location.pathname}?${q}`);}
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
function card(post){
 const article=node('article','card');article.dataset.id=post.id;article.dataset.date=post.publishedAt;
 const video=post.media.some(m=>m.kind==='video'||m.kind==='gif');const photos=post.media.filter(m=>m.kind==='image').length;
 const first=post.media[0];
 const viewer=window.reviewGallery(post.media.map(m=>({src:smallPreview(m.previewUrl),originalSrc:m.previewUrl,url:post.canonicalUrl,kind:m.kind,alt:post.authorHandle+(m.kind==='image'?' 사진':' 영상 미리보기')})),{label:'피드 사진',managed:true,onChange:i=>photoPositions.set(post.id,i)});
 viewer.element.classList.add('feed-gallery');viewer.element.style.setProperty('--photo-ratio',first.width&&first.height?String(first.width/first.height):'0.75');viewer.select(photoPositions.get(post.id)??0,false);feedViewers.push(viewer);article.append(viewer.element);
 if(video)article.append(node('span','via','영상은 원문에서 재생'));
 const original=node('a','feed-original','원문 보기 ↗');original.href=post.canonicalUrl;original.target='_blank';original.rel='noopener noreferrer';article.append(original);
 const meta=node('div','card-meta');meta.append(node('span','author',`@${post.authorHandle}`),node('span','category',kinds[post.contentKind]||'기타'));article.append(meta);const time=node('time',null,stamp(post.publishedAt));time.dateTime=post.publishedAt;article.append(time);
 const caption=displayCaption(post.caption);if(caption)article.append(node('p','caption',caption));
 if(post.authorHandle.toLowerCase()!==post.observedViaSource.toLowerCase())article.append(node('span','via',`발견 출처 @${post.observedViaSource}`));for(const source of post.duplicateSources||[]){const a=node('a','via','같은 사진 출처 @'+source.author);a.href=source.url;a.target='_blank';a.rel='noopener noreferrer';article.append(a);}return article;
}
function render(){
 clearViewers();
 const activeFilters=Number($('#kind').value!=='all')+Number($('#source').value!=='all');
 $('#filter-toggle').textContent=activeFilters?`필터 · ${activeFilters}`:'필터';
 document.querySelectorAll('[data-sort]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.sort===$('#sort').value)));
 document.querySelectorAll('[data-media]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.media===media)));
 const month=$('#month').value;
 $('#clear-month').hidden=!month;
 const monthDescription=month?`${month.slice(0,4)}년 ${Number(month.slice(5))}월 선택됨`:'전체 기간';
 $('#month-trigger').setAttribute('aria-label',`게시월 선택 · ${monthDescription}`);
 $('#month-trigger').dataset.active=String(Boolean(month));
 $('#month-trigger .icon-tooltip').textContent=`게시월 선택 · ${monthDescription}`;
 const selected=live?[...posts]:posts.filter(p=>(!month||new Date(p.publishedAt).toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'}).startsWith(month+'-'))&&(media==='all'||p.media.some(m=>media==='video'?['video','gif'].includes(m.kind):m.kind==='image'))&&($('#kind').value==='all'||p.contentKind===$('#kind').value)&&($('#source').value==='all'||p.observedViaSource===$('#source').value));
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
 $('#refresh').disabled=true;more.disabled=true;$('#notice').textContent='';$('#gallery').setAttribute('aria-busy','true');
 if(!append){clearViewers();photoPositions.clear();posts=[];loaded=false;nextCursor=null;more.hidden=true;$('#empty').hidden=true;$('#count').textContent='불러오는 중…';$('#gallery').replaceChildren(...Array.from({length:6},()=>{const e=node('div','skeleton');e.setAttribute('aria-hidden','true');return e;}));}
 try{
  const response=await fetch(`/api/feed?${query}`);if(!response.ok)throw Error(response.status===401||response.status===403?'auth':'feed');
  const data=await response.json();if(!Array.isArray(data.posts))throw Error('shape');if(version!==requestVersion)return;
  const known=new Set(posts.map(p=>p.id));posts.push(...data.posts.filter(p=>!known.has(p.id)));total=data.total;nextCursor=data.nextCursor;collectedAt=data.collectedAt;loaded=true;render();
  try{const response=await fetch('/api/sources');if(!response.ok)throw Error('status');const data=await response.json();if(version!==requestVersion)return;states=data.sources;
   const current=$('#source').value;const names=new Set(states.map(s=>s.source));if(current!=='all')names.add(current);
   $('#source').replaceChildren(new Option('모든 출처','all'),...[...names].sort().map(s=>new Option(`@${s}`,s)));$('#source').value=current;renderSources();
   if(states.some(s=>s.last_error_code))$('#notice').textContent='일부 출처의 갱신이 지연되고 있어요. 수집 상태를 확인해 주세요.';
  }catch{if(version===requestVersion){states=[];renderSources();$('#notice').textContent='게시물은 불러왔지만 수집 상태는 확인하지 못했어요.';}}
 }catch(error){if(version!==requestVersion)return;if(!append){$('#gallery').replaceChildren();$('#count').textContent='목록 조회 실패';}$('#notice').textContent=error.message==='auth'?'로그인이 만료됐어요. 페이지를 새로고침해 로그인해 주세요.':'목록을 불러오지 못했어요. 다시 시도해 주세요.';}
 finally{if(version===requestVersion){$('#refresh').disabled=false;more.disabled=false;$('#gallery').setAttribute('aria-busy','false');}}
}
function changeFilters(){if(live){posts=[];loaded=false;render();loadLive();}else{render();syncUrl();}}
function renderSources(){
 const host=$('#source-status');host.replaceChildren();
 if(!states.length){host.append(node('p','muted','수집 상태를 확인하지 못했어요. 상태 새로고침으로 다시 시도해 주세요.'));return;}
 for(const s of states){
  const paused=!s.enabled||s.collection_enabled===false||s.collection_enabled===0;
  const attention=s.catchup_status==='needs_attention';
  const text=paused?'수집 중지':attention?'확인 필요':s.last_error_code?'재시도 대기':!s.last_success_at?'첫 수집 대기':'수집 성공';
  const row=node('section','source-row'),heading=node('div','source-heading');
  heading.append(node('strong',null,`@${s.source}`),node('span',attention||s.last_error_code?'source-state warning':'source-state',text));row.append(heading);
  if(s.last_success_at){
   row.append(node('p',null,`마지막 성공 · ${stamp(s.last_success_at*1000)}`));
   if(Number.isInteger(s.last_received_count)&&Number.isInteger(s.last_matched_count)){
    row.append(node('p','source-result',`마지막 성공 페이지 · 응답 ${s.last_received_count}개 / 조건 통과 ${s.last_matched_count}개`));
    if(s.last_review_count>0)row.append(node('p',null,`공식 검토 보류 ${s.last_review_count}개 · 피드에는 표시되지 않아요.`));
    else if(s.last_matched_count===0)row.append(node('p',null,'이 페이지에는 수집 조건과 기간에 맞는 게시물이 없었어요.'));
   }else row.append(node('p',null,'상세 건수는 다음 수집 성공부터 표시해요.'));
  }else row.append(node('p',null,'아직 수집 성공 기록이 없어요.'));
  if(s.last_error_code){
   const code=s.last_error_code;
   const reason=code.includes('429')?'요청 한도에 도달했어요.':code.includes('timeout')?'응답 대기 시간이 초과됐어요.':code.includes('network')?'수집 서버에 연결하지 못했어요.':/401|403/.test(code)?'수집 서버가 접근을 거부했어요.':'수집 중 오류가 발생했어요.';
   row.append(node('p','source-error',reason+(paused?' 수집이 중지되어 있어요.':attention?' 설정 확인이 필요해요.':' 자동으로 다시 시도해요.')));
   const details=node('details');details.append(node('summary',null,'오류 상세'),node('code',null,code));row.append(details);
  }
  if(!paused&&!attention&&s.next_due_at)row.append(node('p',null,(s.next_due_at*1000<=Date.now()?'실행 순서 대기 · ':'다음 조회 가능 · ')+stamp(s.next_due_at*1000)));
  host.append(row);
 }
}
async function refreshSources(){
 const button=$('#refresh-status');button.disabled=true;$('#status-message').textContent='상태를 불러오는 중…';
 try{
  const response=await fetch('/api/sources');if(!response.ok)throw Error('status');
  const data=await response.json();if(!Array.isArray(data.sources))throw Error('shape');
  states=data.sources;renderSources();$('#status-message').textContent=live?'방금 상태를 확인했어요.':'로컬 저장본이에요. 실제 운영 상태와 다를 수 있어요.';
 }catch{$('#status-message').textContent='상태 조회에 실패했어요. 다시 시도해 주세요. 아래는 이전 조회 결과예요.';}
 finally{button.disabled=false;}
}
async function load(){
 if(live)return loadLive();
 $('#refresh').disabled=true;$('#notice').textContent='';
 if(!loaded)$('#gallery').replaceChildren(...Array.from({length:6},()=>{const e=node('div','skeleton');e.setAttribute('aria-hidden','true');return e;}));
 try{const response=await fetch('/api/samples');if(!response.ok)throw Error('feed');const data=await response.json();if(!Array.isArray(data.posts))throw Error('shape');posts=[...data.posts].sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt)||a.id.localeCompare(b.id));collectedAt=data.collectedAt;loaded=true;
 const current=$('#source').value;const known=new Set(posts.map(p=>p.observedViaSource));try{const response=await fetch('/api/sources');if(!response.ok)throw Error('status');states=(await response.json()).sources;states.forEach(s=>known.add(s.source));}catch{states=[];$('#notice').textContent='게시물은 불러왔지만 수집 상태는 확인하지 못했어요.';}
 $('#source').replaceChildren(new Option('모든 출처','all'),...[...known].sort().map(s=>new Option(`@${s}`,s)));const requested=loadedOnce?current:params.get('source');if(known.has(requested))$('#source').value=requested;loadedOnce=true;
 if(states.some(s=>s.last_error_code))$('#notice').textContent='일부 출처의 갱신이 지연되고 있어요. 수집 상태를 확인해 주세요.';
 render();renderSources();syncUrl();
 }catch{if(!loaded){$('#gallery').replaceChildren();$('#count').textContent='목록 조회 실패';}$('#notice').textContent='목록을 불러오지 못했어요. 목록 새로고침으로 다시 시도해 주세요.';}finally{$('#refresh').disabled=false;}
}
let loadedOnce=false;
if(live && /^[A-Za-z0-9_]{1,15}$/.test(params.get('source')||'')){const source=params.get('source');document.querySelector('#source').append(new Option('@'+source,source));document.querySelector('#source').value=source;}
$('#filter-toggle').addEventListener('click',()=>{const open=$('#filter-toggle').getAttribute('aria-expanded')!=='true';$('#filter-toggle').setAttribute('aria-expanded',String(open));$('.filters').dataset.open=String(open);});
if(Object.hasOwn(kinds,params.get('kind')))$('#kind').value=params.get('kind');
if(params.get('sort')==='oldest')$('#sort').value='oldest';
document.querySelectorAll('[data-sort]').forEach(b=>b.addEventListener('click',()=>{$('#sort').value=b.dataset.sort;changeFilters();}));
if(/^\d{4}-(0[1-9]|1[0-2])$/.test(params.get('month')||''))$('#month').value=params.get('month');
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
