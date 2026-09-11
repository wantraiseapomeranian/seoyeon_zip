const $=s=>document.querySelector(s);
function hasFilters(){return ['date','media','author','kind'].some(key=>{const el=$('#review-'+key);return el&&el.value&&el.value!=='all';});}
function sizeFilterSelects(){
 const context=document.createElement('canvas').getContext('2d');if(!context)return;
 for(const select of document.querySelectorAll('.review-filters select')){
  const style=getComputedStyle(select);context.font=style.font||style.fontSize+' '+style.fontFamily;
  select.style.width=Math.ceil(context.measureText(select.selectedOptions[0]?.textContent||'').width+parseFloat(style.paddingLeft)+parseFloat(style.paddingRight)+28)+'px';
 }
}
function syncFilterLabel(){sizeFilterSelects();const count=['author','kind'].filter(key=>{const field=$('#review-'+key);return field&&field.value&&field.value!=='all';}).length;$('#review-more').textContent=count?'필터 · '+count:'필터';}
function filterQuery(){syncFilterLabel();const q=new URLSearchParams();for(const key of ['date','media','author','kind']){const el=$('#review-'+key);if(el)q.set(key,el.value);}return '&'+q;}
function updateAuthors(authors=[]){const el=$('#review-author'),value=el.value;el.replaceChildren(new Option('모든 계정',''),...[...new Set([...authors,...(value?[value]:[])])].sort().map(a=>new Option('@'+a,a)));el.value=value;sizeFilterSelects();}

let status='pending',offset=0,busy=false;
const labels={pending:'미검토',kept:'표시 중',held:'보류',excluded:'제외'};
const errors={review_conflict:'다른 화면에서 수정된 글이에요. 새로고침 후 다시 확인해 주세요.',invalid_import:'JSON 배열 형식과 게시물 정보를 확인해 주세요. 한 번에 100개, 2MB까지 가져올 수 있어요.'};
async function api(path='',body){
  const response=await fetch('/api/admin/instagram'+path,{headers:body?{'Content-Type':'application/json','X-Review-Action':'review'}:{},...(body?{method:'POST',body:JSON.stringify(body)}:{})});
  if(!response.ok){let data;try{data=await response.json();}catch{}const error=new Error(errors[data?.error]??([401,403].includes(response.status)?'로그인을 확인하고 페이지를 다시 열어 주세요.':'요청을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.'));error.status=response.status;error.code=data?.error;throw error;}
  return response.json();
}
function el(tag,text,className){const n=document.createElement(tag);if(text!=null)n.textContent=text;if(className)n.className=className;return n;}
function link(url,text,className){const n=el('a',text,className);n.href=url;n.target='_blank';n.rel='noopener noreferrer';return n;}
function card(p){
  const article=el('article',null,'review-card');
  const images=p.images?.length?p.images:(p.image?[p.image]:[]);
  const preview=window.reviewGallery(images.map((src,i)=>({src,url:p.url,kind:p.media?.find(m=>m.previewUrl===src)?.kind,alt:(p.author||'인스타그램')+' 사진 '+(i+1)})),{label:'게시물 사진'}).element;
  const body=el('div',null,'review-body'),meta=el('div',null,'review-meta');
  const time=el('time',p.publishedAt?new Date(p.publishedAt).toLocaleDateString('ko-KR'):'게시일 미상');if(p.publishedAt)time.dateTime=p.publishedAt;
  meta.append(el('h2',p.author?`@${p.author}`:'작성자 미상'),time);
  const tags=el('div',null,'review-tags');tags.append(el('span',labels[p.status]),el('span',p.media?.some(m=>m.kind==='video')?(p.media.some(m=>m.kind==='image')?'사진·영상':'영상'):p.media?.every(m=>m.kind==='image')?'사진':'유형 미확인'),el('span',`미디어 ${p.mediaCount}개`));
  if(p.firstSeenInTrial!==null)tags.append(el('span',p.firstSeenInTrial?'시험 중 처음 발견':'기존 발견 글'));
  if(p.newlyPublished===true)tags.append(el('span','시험 시작 후 게시'));
  const reasons=el('ul',null,'review-reasons');p.reasons.filter(r=>r!=='그룹·인물 문맥 일치 · 사진은 직접 확인').forEach(r=>reasons.append(el('li',r)));reasons.hidden=!reasons.childElementCount;
  if(images.length<p.mediaCount)tags.append(el('span','저장된 미리보기 '+images.length+'장 · 전체는 원문에서 확인'));
  body.append(meta,tags,reasons,el('p',p.caption||'본문이 없는 게시물이에요.','review-caption'),link(p.url,'원문에서 보기 ↗','review-link'));
  const actions=el('div',null,'review-buttons');
  for(const value of ['kept','excluded','held','pending']){const button=el('button',value==='pending'?'판단 취소':value==='kept'?'피드에 표시':labels[value]);button.setAttribute('aria-pressed',String(p.status===value));button.disabled=p.status===value;button.addEventListener('click',async()=>{
    if(busy)return;busy=true;actions.querySelectorAll('button').forEach(b=>b.disabled=true);
    try{if(await window.reviewDecision({action:value,label:button.textContent,submit:details=>api('/'+p.code,{status:value,revision:p.revision,...details})})){await load();$('#message').textContent=`${labels[value]} 상태로 저장했어요.`;}else actions.querySelectorAll('button').forEach(b=>b.disabled=b.getAttribute('aria-pressed')==='true');}catch(e){$('#message').textContent=e.message;actions.querySelectorAll('button').forEach(b=>b.disabled=b.getAttribute('aria-pressed')==='true');}finally{busy=false;}
  });actions.append(button);}body.append(actions);article.append(preview,body);return article;
}
let generation=0;
async function load(){
  const current=++generation;$('#items').setAttribute('aria-busy','true');
  try{const data=await api(`?status=${status}&offset=${offset}${filterQuery()}`);if(current!==generation)return;
    updateAuthors(data.authors);const total=Object.values(data.counts).reduce((a,b)=>a+b,0),count=status==='all'?total:(data.counts[status]??0);
    if(offset&&offset>=count){offset=Math.max(0,offset-25);return load();}
    $('#items').replaceChildren(...data.items.map(card));
    $('#empty').hidden=data.items.length>0;$('#empty h2').textContent={pending:'지금 검토할 글이 없어요.',kept:'표시 중인 글이 없어요.',held:'보류한 글이 없어요.',excluded:'제외한 글이 없어요.',all:'아직 가져온 게시물이 없어요.'}[status];if(hasFilters())$('#empty h2').textContent='조건에 맞는 게시물이 없어요.';$('#empty p').hidden=total>0||hasFilters();$('#empty p').textContent='상단의 결과 가져오기로 게시물을 추가할 수 있어요.';$('.pagination').hidden=count<=25;
    $('#tabs').querySelectorAll('button').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.status===status));b.querySelector('span').textContent=b.dataset.status==='all'?total:(data.counts[b.dataset.status]??0);});
    $('#previous').disabled=offset===0;$('#next').disabled=offset+25>=count;$('#page').textContent=`${Math.floor(offset/25)+1}페이지`;
  }finally{if(current===generation)$('#items').setAttribute('aria-busy','false');}
}
function reload(){load().catch(e=>$('#message').textContent=e.message);}
$('#tabs').addEventListener('click',e=>{const b=e.target.closest('button');if(!b||busy)return;status=b.dataset.status;offset=0;$('#message').textContent='';reload();});
$('#refresh').addEventListener('click',reload);
$('#previous').addEventListener('click',()=>{offset=Math.max(0,offset-25);reload();});$('#next').addEventListener('click',()=>{offset+=25;reload();});
$('#open-import').addEventListener('click',()=>$('#import-dialog').showModal());
$('#close-import').addEventListener('click',()=>$('#import-dialog').close());
function clearImportError(){for(const id of ['json','file'])$('#'+id).removeAttribute('aria-invalid');$('#import-error').textContent='';}
for(const id of ['json','file'])$('#'+id).setAttribute('aria-describedby','import-error');
$('#json').addEventListener('input',clearImportError);
$('#file').addEventListener('change',async()=>{clearImportError();const file=$('#file').files[0];if(!file)return;if(file.size>2_000_000){$('#file').setAttribute('aria-invalid','true');$('#import-error').textContent='파일은 2MB까지 가져올 수 있어요.';return;}$('#json').value=await file.text();});
$('#import-form').addEventListener('submit',async e=>{e.preventDefault();const button=$('#import-submit');button.disabled=true;clearImportError();try{
  let rows;try{rows=JSON.parse($('#json').value);}catch{$('#json').setAttribute('aria-invalid','true');throw new Error('올바른 JSON 내용을 입력해 주세요.');}
  const result=await api('/import',rows);$('#import-dialog').close();$('#json').value='';$('#file').value='';offset=0;await load();$('#message').textContent=`${result.imported}개 게시물 정보를 가져왔어요. 기존 판단은 유지했어요.`;
}catch(error){$('#import-error').textContent=error.message;if($('#json').getAttribute('aria-invalid')==='true')$('#json').focus();}finally{button.disabled=false;}});
for(const el of document.querySelectorAll('.review-filters input,.review-filters select'))el.addEventListener('change',()=>{offset=0;reload();});
$('#review-reset').onclick=()=>{for(const key of ['date','media','author','kind']){const el=$('#review-'+key);if(el)el.value=['media','kind'].includes(key)?'all':'';}offset=0;reload();};
reload();

$('#review-more').onclick=()=>{const button=$('#review-more'),open=button.getAttribute('aria-expanded')!=='true';button.setAttribute('aria-expanded',String(open));$('#review-extra').hidden=!open;};

async function loadSyncStatus(){try{const sync=await api('/sync');const text={unconfigured:'자동 가져오기 설정 대기',disabled:'자동 가져오기 중지됨',waiting:'새 수집 결과를 기다리고 있어요.',retry:'자동 가져오기에 실패했어요. 잠시 후 다시 시도해요.',connected:sync.syncedAt?'마지막 자동 가져오기 · '+new Date(sync.syncedAt).toLocaleString('ko-KR'):'자동 가져오기 연결됨'};$('#sync-status').textContent=text[sync.status]||'';}catch{$('#sync-status').textContent='자동 가져오기 상태를 확인하지 못했어요.';}}
loadSyncStatus();$('#refresh').addEventListener('click',loadSyncStatus);
