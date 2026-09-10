const $=s=>document.querySelector(s);
let status='pending',offset=0,busy=false;
const labels={pending:'미검토',kept:'보관',held:'보류',excluded:'제외'};
const errors={review_conflict:'다른 화면에서 수정된 글이에요. 새로고침 후 다시 확인해 주세요.',invalid_import:'JSON 배열 형식과 게시물 정보를 확인해 주세요. 한 번에 100개, 2MB까지 가져올 수 있어요.'};
async function api(path='',body){
  const response=await fetch('/api/admin/instagram'+path,{headers:body?{'Content-Type':'application/json','X-Review-Action':'review'}:{},...(body?{method:'POST',body:JSON.stringify(body)}:{})});
  if(!response.ok){let data;try{data=await response.json();}catch{}throw new Error(errors[data?.error]??([401,403].includes(response.status)?'로그인을 확인하고 페이지를 다시 열어 주세요.':'요청을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.'));}
  return response.json();
}
function el(tag,text,className){const n=document.createElement(tag);if(text!=null)n.textContent=text;if(className)n.className=className;return n;}
function link(url,text,className){const n=el('a',text,className);n.href=url;n.target='_blank';n.rel='noopener noreferrer';return n;}
function card(p){
  const article=el('article',null,'review-card');
  const preview=link(p.url,null,'review-image');preview.setAttribute('aria-label',`${p.author||'작성자 미상'} 게시물 원문 열기`);
  const fallback=el('span',null,'fallback');fallback.append(el('span','미리보기를 표시할 수 없어요'),el('strong','인스타그램 원문 보기'));
  if(p.image){const img=el('img');img.src=p.image;img.alt=`${p.author||'인스타그램'} 게시물 첫 사진`;img.loading='lazy';img.referrerPolicy='no-referrer';img.addEventListener('error',()=>preview.replaceChildren(fallback),{once:true});preview.append(img);}else preview.append(fallback);
  const body=el('div',null,'review-body'),meta=el('div',null,'review-meta');
  const time=el('time',p.publishedAt?new Date(p.publishedAt).toLocaleDateString('ko-KR'):'게시일 미상');if(p.publishedAt)time.dateTime=p.publishedAt;
  meta.append(el('h2',p.author?`@${p.author}`:'작성자 미상'),time);
  const tags=el('div',null,'review-tags');tags.append(el('span',labels[p.status]),el('span',`미디어 ${p.mediaCount}개`));
  if(p.firstSeenInTrial!==null)tags.append(el('span',p.firstSeenInTrial?'시험 중 처음 발견':'기존 발견 글'));
  if(p.newlyPublished===true)tags.append(el('span','시험 시작 후 게시'));
  const reasons=el('ul',null,'review-reasons');p.reasons.forEach(r=>reasons.append(el('li',r)));
  body.append(meta,tags,reasons,el('p',p.caption||'본문이 없는 게시물이에요.','review-caption'),link(p.url,'원문에서 전체 사진 보기 ↗','review-link'));
  const actions=el('div',null,'review-buttons');
  for(const value of ['kept','excluded','held','pending']){const button=el('button',value==='pending'?'판단 취소':labels[value]);button.setAttribute('aria-pressed',String(p.status===value));button.disabled=p.status===value;button.addEventListener('click',async()=>{
    if(busy)return;busy=true;actions.querySelectorAll('button').forEach(b=>b.disabled=true);
    try{await api('/'+p.code,{status:value,revision:p.revision});await load();$('#message').textContent=`${labels[value]} 상태로 저장했어요.`;}catch(e){$('#message').textContent=e.message;actions.querySelectorAll('button').forEach(b=>b.disabled=b.getAttribute('aria-pressed')==='true');}finally{busy=false;}
  });actions.append(button);}body.append(actions);article.append(preview,body);return article;
}
let generation=0;
async function load(){
  const current=++generation;$('#items').setAttribute('aria-busy','true');
  try{const data=await api(`?status=${status}&offset=${offset}`);if(current!==generation)return;
    const total=Object.values(data.counts).reduce((a,b)=>a+b,0),count=status==='all'?total:(data.counts[status]??0);
    if(offset&&offset>=count){offset=Math.max(0,offset-25);return load();}
    $('#items').replaceChildren(...data.items.map(card));
    $('#empty').hidden=data.items.length>0;$('#empty h2').textContent=total?'이 상태의 게시물이 없어요':'아직 가져온 게시물이 없어요';$('#empty p').textContent=total?'다른 상태를 선택하거나 새로운 결과를 가져와 보세요.':'Apify에서 내보낸 JSON 결과를 가져오면 여기서 검토할 수 있어요.';
    $('#tabs').querySelectorAll('button').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.status===status));b.querySelector('span').textContent=b.dataset.status==='all'?total:(data.counts[b.dataset.status]??0);});
    $('#previous').disabled=offset===0;$('#next').disabled=offset+25>=count;$('#page').textContent=`${Math.floor(offset/25)+1}페이지`;
  }finally{if(current===generation)$('#items').setAttribute('aria-busy','false');}
}
function reload(){load().catch(e=>$('#message').textContent=e.message);}
$('#tabs').addEventListener('click',e=>{const b=e.target.closest('button');if(!b||busy)return;status=b.dataset.status;offset=0;$('#message').textContent='';reload();});
$('#refresh').addEventListener('click',reload);
$('#previous').addEventListener('click',()=>{offset=Math.max(0,offset-25);reload();});$('#next').addEventListener('click',()=>{offset+=25;reload();});
for(const id of ['#open-import','#empty-import'])$(id).addEventListener('click',()=>$('#import-dialog').showModal());
$('#close-import').addEventListener('click',()=>$('#import-dialog').close());
$('#file').addEventListener('change',async()=>{const file=$('#file').files[0];if(!file)return;if(file.size>2_000_000){$('#import-error').textContent='파일은 2MB까지 가져올 수 있어요.';return;}$('#json').value=await file.text();$('#import-error').textContent='';});
$('#import-form').addEventListener('submit',async e=>{e.preventDefault();const button=$('#import-submit');button.disabled=true;$('#import-error').textContent='';try{
  let rows;try{rows=JSON.parse($('#json').value);}catch{throw new Error('올바른 JSON 내용을 입력해 주세요.');}
  const result=await api('/import',rows);$('#import-dialog').close();$('#json').value='';$('#file').value='';offset=0;await load();$('#message').textContent=`${result.imported}개 게시물 정보를 가져왔어요. 기존 판단은 유지했어요.`;
}catch(error){$('#import-error').textContent=error.message;}finally{button.disabled=false;}});
reload();
