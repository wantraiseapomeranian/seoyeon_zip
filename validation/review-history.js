(() => {
  const $=selector=>document.querySelector(selector);
  const node=(tag,text,className)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(className)n.className=className;return n;};
  const actions={SHOW:'표시 허용',HIDE:'숨김',RESET_AUTO:'자동 기준으로 복귀',KEEP:'승인',EXCLUDE:'제외',HOLD:'보류',RESET_PENDING:'검토 대기로 복귀',MARK_SAME_IMAGE:'같은 사진으로 묶기',MARK_DIFFERENT_IMAGE:'다른 사진 판정',UNMERGE:'묶음 해제'};
  const states={visible:'표시 허용',hidden:'숨김',auto:'자동 기준',kept:'승인',excluded:'제외',held:'보류',pending:'검토 대기'};
  const platforms={X:'X',INSTAGRAM:'Instagram'};
  const time=value=>{const date=new Date(value);return value&&!Number.isNaN(date.valueOf())?date.toLocaleString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false})+' (한국시간)':'시각 미확인';};
  const reason=code=>window.reviewReasonLabels[code]||'이유 미확인';
  function sourceUrl(value){try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port)return null;const valid=(['x.com','www.x.com','twitter.com','www.twitter.com'].includes(u.hostname)&&/^\/[A-Za-z0-9_]+\/status\/\d+\/?$/.test(u.pathname))||(['instagram.com','www.instagram.com'].includes(u.hostname)&&/^\/(p|reel|tv)\/[A-Za-z0-9_-]+\/?$/.test(u.pathname));return valid?u.href:null;}catch{return null;}}
  function source(value,label='원문 보기 ↗'){const href=sourceUrl(value);if(!href)return node('span','원문 주소 미확인','review-note');const a=node('a',label,'review-link');a.href=href;a.target='_blank';a.rel='noopener noreferrer';return a;}
  function imageUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&(u.hostname==='pbs.twimg.com'||u.hostname.endsWith('.cdninstagram.com')||u.hostname.endsWith('.fbcdn.net'))?u.href:null;}catch{return null;}}
  async function api(path){const response=await fetch(path);if(!response.ok)throw new Error(response.status===400?'필터와 기간을 확인한 뒤 다시 조회해 주세요.':response.status===404?'이 기록을 찾을 수 없어요.':response.status===401||response.status===403?'로그인 상태를 확인하고 페이지를 다시 열어 주세요.':'내역을 불러오지 못했어요. 다시 시도해 주세요.');return response.json();}
  function facts(entries){const dl=node('dl',null,'history-facts');for(const [key,value] of entries){dl.append(node('dt',key),node('dd',value));}return dl;}
  let cursor=null,query=new URLSearchParams(),generation=0,loading=false,detailGeneration=0,opener=null;
  const list=$('#history-list'),more=$('#history-more'),dialog=$('#history-detail');
  function thumbnail(summary){const frame=node('div',null,'history-thumbnail'),img=node('img'),fallback=node('span','사진 미리보기 없음');const url=imageUrl(summary?.thumbnailUrl);img.alt='검토한 게시물 사진';img.loading='lazy';img.decoding='async';img.referrerPolicy='no-referrer';img.width=112;img.height=140;fallback.hidden=!!url;if(url)img.src=url;else img.hidden=true;img.onerror=()=>{img.hidden=true;fallback.hidden=false;};if(summary?.thumbnailSource==='current'){frame.title='현재 게시물에서 불러온 미리보기';img.alt='현재 게시물 사진';}frame.append(img,fallback);return frame;}
  function actionIcon(control,label,pathData){control.classList.add('review-icon');const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),path=document.createElementNS(ns,'path');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.7');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');path.setAttribute('d',pathData);svg.append(path);const tip=node('span',label,'icon-tooltip');tip.setAttribute('aria-hidden','true');control.replaceChildren(svg,tip);return control;}
  function originalIcon(url){const a=source(url);if(a.tagName!=='A')return a;a.className='history-original';a.setAttribute('aria-label','원문 보기');return actionIcon(a,'원문 보기','M14 3h7v7M21 3 10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5');}
  function row(item){const li=node('li',null,'history-entry'),date=node('time',time(item.reviewedAt).replace(' (한국시간)','')),preview=node('div',null,'history-preview'),body=node('div',null,'history-entry-body'),controls=node('div',null,'history-entry-actions'),button=actionIcon(node('button',null,'history-detail-trigger'),'상세 보기','M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Zm0 0v6h6M8 13h8M8 17h6');date.dateTime=item.reviewedAt;date.title='한국시간';preview.append(date,thumbnail(item.summary));body.append(node('h2',`${platforms[item.platform]||item.platform} · ${actions[item.action]||'검토 결정'}`),node('p',item.summary?.author?'@'+item.summary.author:'작성자 미상'),node('p',reason(item.reasonCode),'history-reason'));if(item.note)body.append(node('p',item.note,'history-note history-note-preview'));button.setAttribute('aria-label',`${actions[item.action]||'검토 결정'} 상세 보기 · ${time(item.reviewedAt)}`);button.type='button';button.onclick=()=>openDetail(item.id,button);controls.append(originalIcon(item.summary?.url),button);body.append(controls);li.append(preview,body);return li;}
  async function load(append=false){
    if(append&&loading)return;
    const current=++generation;loading=true;list.setAttribute('aria-busy','true');more.setAttribute('aria-disabled','true');$('#history-error').textContent='';$('#history-status').textContent='내역을 불러오고 있어요.';
    if(!append){list.replaceChildren();cursor=null;more.hidden=true;}
    const params=new URLSearchParams(query);if(append&&cursor)params.set('cursor',cursor);
    try{const data=await api('/api/admin/review-audit?'+params);if(current!==generation)return;
      if(data.startedAt)$('#history-start').textContent=`검토 내역은 ${time(data.startedAt)} 이후 이력 기록 기능을 통해 저장된 변경부터 표시됩니다.`;
      else $('#history-start').textContent='기록 시작 시각을 확인할 수 없어요. 새로고침해 주세요.';
      const previousCount=list.children.length;list.append(...data.items.map(row));if(append&&document.activeElement===more)list.children[previousCount]?.querySelector('button')?.focus();cursor=data.nextCursor;more.hidden=!cursor;$('#history-status').textContent=list.children.length?`${list.children.length}건 표시 · 최신순`:'조건에 맞는 검토 내역이 없어요.';
    }catch(error){if(current!==generation)return;$('#history-error').textContent=error.message;$('#history-status').textContent='';}
    finally{if(current===generation){loading=false;more.removeAttribute('aria-disabled');list.setAttribute('aria-busy','false');}}
  }
  function stateSection(label,state){const section=node('section');section.append(node('h3',label));if(!state){section.append(node('p','상태 미확인'));return section;}
    if(state.decision!=null||state.status!=null)section.append(node('p',states[state.decision??state.status]||'상태 미확인'));
    if(state.revision!=null)section.append(node('p','게시물 버전 '+state.revision));
    if(state.groupRevision!=null)section.append(node('p','사진 묶음 버전 '+state.groupRevision));
    if(typeof state.different==='boolean')section.append(node('p',state.different?'다른 사진으로 판정됨':'다른 사진 판정 없음'));
    if(Array.isArray(state.members)){
      section.append(node('p',`영향받은 사진 ${state.members.length}장`));
      const details=node('details'),ul=node('ul');details.append(node('summary','구성원과 묶음 확인'));
      const groupLabels=new Map();for(const member of state.members){const group=member.confirmed_hash??member.confirmedHash;let groupLabel='수동 묶음 없음';if(group){if(!groupLabels.has(group))groupLabels.set(group,groupLabels.size+1);groupLabel='수동 묶음 '+groupLabels.get(group);}const li=node('li',groupLabel+' · '+(member.hash?'파일 해시 있음':'파일 해시 미확인'));li.append(node('p',member.url||'사진 주소 미확인'));ul.append(li);}details.append(ul);section.append(details);
    }return section;
  }
  function imageFigure(image,index){const figure=node('figure',null,'history-image'),img=node('img'),fallback=node('p','현재 이미지를 불러올 수 없어요. 아래 원문에서 확인해 주세요.','history-image-fallback'),caption=node('figcaption');img.alt=`비교 사진 ${index+1}`;img.referrerPolicy='no-referrer';fallback.hidden=true;img.onerror=()=>{img.hidden=true;fallback.hidden=false;};const url=imageUrl(image.url);if(url)img.src=url;else{img.hidden=true;fallback.hidden=false;}caption.append(node('p',`사진 ${index+1}`));for(const post of image.posts||[])caption.append(node('p',`${post.author?'@'+post.author:'작성자 미상'}${post.position!=null?' · 사진 위치 '+post.position:''}`),source(post.url));figure.append(img,fallback,caption);return figure;}
  function evidence(metadata){const section=node('section',null,'history-evidence');section.append(node('h3','사진 판정 근거'));
    const kinds={exact_file:'파일 완전 일치',exact_hash:'파일 완전 일치',sha256:'파일 완전 일치',manual_group:'기존 수동 묶음',confirmed_group:'기존 수동 묶음',similarity_candidate:'유사도 후보',dhash:'유사도 후보',dhash_candidate:'유사도 후보',perceptual_candidate:'유사도 후보'};
    if(metadata.evidenceKind)section.append(node('p',kinds[metadata.evidenceKind]||'사진 비교'));
    const e=metadata.candidateEvidence;
    if(!e||metadata.evidenceStatus==='legacy_unavailable')section.append(node('p','이 후보는 생성 당시 근거가 저장되지 않았어요. 당시 거리와 임계값은 알 수 없어요.'));
    else{
      section.append(node('p',e.origin==='review_time'?'검토 시점에 계산한 근거예요. 후보 생성 당시 값과 구분해 확인해 주세요.':'후보 생성 당시 저장한 근거예요.'));
      const pairs=[['생성 시각',time(e.generatedAt)],['알고리즘',e.algorithm||'미확인'],['버전',e.algorithmVersion||'미확인']];
      for(const [label,key] of [['해시 비트','hashBits'],['사진 거리','distance'],['후보 임계값','threshold'],['종횡비 허용 차이','aspectRatioTolerance'],['왼쪽 종횡비','leftAspectRatio'],['오른쪽 종횡비','rightAspectRatio']])if(e[key]!=null)pairs.push([label,String(e[key])]);section.append(facts(pairs));
      const hashes=[['왼쪽 파일 SHA-256',e.leftSha256||e.leftFileHash||e.leftHash],['오른쪽 파일 SHA-256',e.rightSha256||e.rightFileHash||e.rightHash],['왼쪽 dHash',e.leftDhash],['오른쪽 dHash',e.rightDhash]].filter(([,value])=>value);if(hashes.length){const details=node('details');details.append(node('summary','저장된 해시 확인'),facts(hashes));section.append(details);}
    }
    if(metadata.humanDecision)section.append(node('p','최종 검토자 결정: '+(actions[metadata.humanDecision]||({same:'같은 사진',different:'다른 사진',merge:'같은 사진',unmerge:'묶음 해제'}[metadata.humanDecision])||'직접 판정')));return section;
  }
  function renderDetail(item){const root=node('div'),meta=item.metadata||{};
    root.append(facts([['플랫폼',platforms[item.platform]||item.platform],['결정',actions[item.action]||'검토 결정'],['검토 시각',time(item.reviewedAt)],['검토자',item.reviewedBy||'미확인'],['이유',reason(item.reasonCode)],['대상',{POST:'게시물',IMAGE_PAIR:'사진 비교',IMAGE_GROUP:'사진 묶음'}[item.targetType]||'미확인']]));
    if(item.note?.length>200){const notes=node('details');notes.append(node('summary','메모 전체 보기'),node('p',item.note,'history-note'));root.append(notes);}else root.append(node('h3','메모'),node('p',item.note||'메모 없음','history-note'));
    if(item.targetType==='POST'){root.append(source(meta.url||item.summary?.url));if(meta.author)root.append(node('p','작성자 · @'+meta.author));if(meta.displayState)root.append(node('p','검토 당시 화면 상태 · '+(states[meta.displayState]||meta.displayState),'history-evidence'));if(meta.reviewReasons?.length)root.append(node('p','검토 당시 안내 · '+meta.reviewReasons.join(' · '),'history-evidence'));}
    const change=node('div',null,'history-states');change.append(stateSection('변경 전',item.previousState),stateSection('변경 후',item.newState));root.append(change);
    if(item.targetType!=='POST'){const images=node('div',null,'history-images');images.append(...(meta.images||[]).map(imageFigure));root.append(node('h3','비교한 사진'),images,evidence(meta));}
    return root;
  }
  async function openDetail(id,button){opener=button;const current=++detailGeneration,content=$('#history-detail-content');content.replaceChildren(node('p','상세 내역을 불러오고 있어요.','history-status'));dialog.showModal();$('#history-close').focus();
    try{const data=await api('/api/admin/review-audit/'+encodeURIComponent(id));if(current===detailGeneration&&dialog.open)content.replaceChildren(renderDetail(data.item));}
    catch(error){if(current!==detailGeneration||!dialog.open)return;const retry=node('button','다시 불러오기');retry.onclick=()=>openDetail(id,button);content.replaceChildren(node('p',error.message,'history-error'),retry);}
  }
  $('#history-close').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{detailGeneration++;opener?.focus();});
  function updateActions(){const select=$('#history-action'),value=select.value,platform=$('#history-platform').value;select.replaceChildren(new Option('전체 결정',''));for(const [code,label]of Object.entries(actions)){if(platform==='X'&&['KEEP','EXCLUDE','HOLD','RESET_PENDING'].includes(code)||platform==='INSTAGRAM'&&!['KEEP','EXCLUDE','HOLD','RESET_PENDING'].includes(code))continue;select.add(new Option(label,code));}select.value=[...select.options].some(option=>option.value===value)?value:'';}
  function filter(){if(!$('#history-filters').reportValidity())return;const from=$('#history-from').value,to=$('#history-to').value;if(from&&to&&from>to){$('#history-error').textContent='종료일은 시작일 이후로 선택해 주세요.';$('#history-to').focus();return;}query=new URLSearchParams();for(const key of ['platform','action','from','to']){const value=$('#history-'+key).value;if(value)query.set(key,value);}load();}
  $('#history-platform').onchange=updateActions;$('#history-filters').onsubmit=event=>{event.preventDefault();filter();};$('#history-filters').onreset=()=>queueMicrotask(()=>{updateActions();filter();});$('#history-refresh').onclick=filter;more.onclick=()=>load(true);updateActions();load();
})();
