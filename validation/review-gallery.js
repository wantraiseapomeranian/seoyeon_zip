// Shared photo viewer for the private review inboxes.
window.reviewGallery=function(items,{label='사진',onChange=()=>{},managed=false,priority=false,fitToImage=false}={}){
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text)n.textContent=text;return n;};
 let index=0,start=null,swiped=false,active=!managed||priority,observer=null,loadingTimer=null,loadTimeout=null,failedSrc=null,openedDialog=null;
 const root=el('div','photo-gallery'),frame=el('button','photo-frame'),img=el('img'),fallback=el('span','photo-fallback','미리보기를 불러올 수 없어요'),controls=el('div','photo-controls'),prev=el('button','photo-arrow'),next=el('button','photo-arrow'),count=el('span','photo-count');
 frame.type=prev.type=next.type='button';frame.setAttribute('aria-label',label+' 확대');prev.setAttribute('aria-label',label+' 이전');next.setAttribute('aria-label',label+' 다음');count.setAttribute('aria-live','polite');img.loading=priority?'eager':'lazy';if(priority)img.fetchPriority='high';img.referrerPolicy='no-referrer';frame.append(img,fallback);controls.append(prev,count,next);root.append(frame,controls);
 for(const [arrow,d] of [[prev,'m14 6-6 6 6 6'],[next,'m10 6 6 6-6 6']]){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),path=document.createElementNS(svg.namespaceURI,'path');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.8');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');path.setAttribute('d',d);svg.append(path);arrow.append(svg);const ring=el('span','photo-loading-ring');ring.setAttribute('aria-hidden','true');arrow.append(ring);}
 function stopLoading(){clearTimeout(loadingTimer);clearTimeout(loadTimeout);loadingTimer=loadTimeout=null;for(const arrow of [prev,next]){arrow.classList.remove('is-loading');arrow.removeAttribute('aria-busy');}}
 // Keep the first photo's frame so controls and metadata stay put while paging.
 function fitImage(){if(fitToImage&&index===0&&items[index]?.kind==='image'&&img.naturalWidth&&img.naturalHeight)root.style.setProperty('--photo-ratio',String(img.naturalWidth/img.naturalHeight));}
 function failed(){stopLoading();failedSrc=items[index]?.src;img.hidden=true;img.removeAttribute('src');fallback.hidden=false;fallback.textContent='사진을 불러오지 못했어요. 눌러서 다시 시도';frame.setAttribute('aria-label',label+' 다시 불러오기');}
 function render(notify=true,arrow=null){
  const item=items[index];if(failedSrc!==item?.src)failedSrc=null;
  img.hidden=!item?.src||!!failedSrc;fallback.hidden=!!item?.src&&!failedSrc;frame.disabled=!item?.src;
  fallback.textContent=failedSrc?'사진을 불러오지 못했어요. 눌러서 다시 시도':'미리보기를 불러올 수 없어요';
  frame.setAttribute('aria-label',failedSrc?label+' 다시 불러오기':item?.kind==='video'||item?.kind==='gif'?'영상 원문 보기':label+' 확대');
  if(item?.src&&active&&!failedSrc){
   if(img.getAttribute('src')!==item.src){
    stopLoading();img.src=item.src;
    if(!img.complete){
     // A native lazy image may not have requested anything yet (off-screen inbox cards).
     if(img.loading==='eager')loadTimeout=setTimeout(()=>{if(img.getAttribute('src')===item.src&&!img.complete)failed();},15000);
     if(arrow)loadingTimer=setTimeout(()=>{loadingTimer=null;if(!img.complete&&root.isConnected){arrow.classList.add('is-loading');arrow.setAttribute('aria-busy','true');}},150);
    }
   }
   img.alt=item.alt??label;
   if(img.complete){if(img.naturalWidth){fitImage();stopLoading();img.hidden=false;fallback.hidden=true;}else failed();}
  }else if(!active||!item?.src){stopLoading();img.removeAttribute('src');}
  count.textContent=items.length?`${label==='후보'?'후보 ':''}${index+1} / ${items.length}`:'사진 없음';prev.hidden=next.hidden=items.length<=1;prev.disabled=index===0;next.disabled=index>=items.length-1;if(notify)onChange(index,item);
 }
 img.onload=()=>{if(!img.complete||!img.getAttribute('src'))return;fitImage();stopLoading();failedSrc=null;img.hidden=false;fallback.hidden=true;};
 img.onerror=()=>{if(!img.complete||!img.getAttribute('src'))return;failed();};
 const select=(i,notify=true)=>{const previous=index;index=Math.max(0,Math.min(items.length-1,i));if(notify){active=true;img.loading='eager';}render(notify,index===previous?null:index<previous?prev:next);};prev.onclick=()=>select(index-1);next.onclick=()=>select(index+1);
 root.onkeydown=e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();select(index+(e.key==='ArrowRight'?1:-1));}};
 frame.onpointerdown=e=>{start={x:e.clientX,y:e.clientY};swiped=false;};frame.onpointerup=e=>{if(!start)return;const dx=e.clientX-start.x,dy=e.clientY-start.y;start=null;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)){swiped=true;select(index+(dx<0?1:-1));}};frame.onpointercancel=()=>{start=null;};
 function openViewer(){
  if(openedDialog)return;
  const photos=items.map((item,i)=>({item,i})).filter(({item})=>item.src&&!['video','gif'].includes(item.kind));
  let position=photos.findIndex(p=>p.i===index),generation=0,timer=null,gesture=null;
  if(position<0)return;
  const dialog=el('dialog','photo-dialog photo-viewer'),header=el('div','photo-viewer-header'),close=el('button','photo-close','닫기'),counter=el('span','photo-viewer-count'),stage=el('div','photo-viewer-stage'),footer=el('div','photo-viewer-footer'),source=el('a',null,'원문 보기 ↗'),status=el('p','photo-viewer-status'),retry=el('button','photo-viewer-retry','다시 불러오기');
  const back=prev.cloneNode(true),forward=next.cloneNode(true);
  for(const [button,name] of [[back,'이전 사진'],[forward,'다음 사진']]){button.className='photo-viewer-arrow';button.type='button';button.hidden=false;button.removeAttribute('aria-busy');button.setAttribute('aria-label',name);button.querySelector('.photo-loading-ring')?.remove();}
  dialog.setAttribute('aria-label',label+' 확대');stage.tabIndex=0;stage.setAttribute('role','group');stage.setAttribute('aria-label','확대 사진');counter.setAttribute('aria-live','polite');status.setAttribute('role','status');close.type=retry.type='button';source.target='_blank';source.rel='noopener noreferrer';
  header.append(counter,close);footer.append(back,source,forward);dialog.append(header,stage,footer);
  const htmlOverflow=document.documentElement.style.overflow,bodyOverflow=document.body.style.overflow;
  const scroll={x:scrollX,y:scrollY};
  document.documentElement.style.overflow=document.body.style.overflow='hidden';
  const finish=()=>{
   if(openedDialog!==dialog)return;
   openedDialog=null;generation++;clearTimeout(timer);dialog.remove();
   document.documentElement.style.overflow=htmlOverflow;document.body.style.overflow=bodyOverflow;
   window.scrollTo(scroll.x,scroll.y);if(root.isConnected)frame.focus({preventScroll:true});
  };
  function show(){
   const current=++generation,{item}=photos[position],large=el('img');clearTimeout(timer);
   large.alt=item.alt??label;large.referrerPolicy='no-referrer';large.draggable=false;large.hidden=true;
   counter.textContent=`${position+1} / ${photos.length}`;back.disabled=position===0;forward.disabled=position===photos.length-1;
   source.hidden=!item.url;if(item.url)source.href=item.url;else source.removeAttribute('href');
   status.hidden=false;status.textContent='사진을 불러오는 중…';retry.hidden=true;stage.setAttribute('aria-busy','true');stage.replaceChildren(large,status,retry);
   const failed=()=>{if(current!==generation)return;generation++;clearTimeout(timer);large.hidden=true;large.removeAttribute('src');stage.setAttribute('aria-busy','false');status.hidden=false;status.textContent='사진을 불러오지 못했어요.';retry.hidden=false;};
   large.onload=()=>{if(current!==generation)return;clearTimeout(timer);large.hidden=false;status.hidden=true;retry.hidden=true;stage.setAttribute('aria-busy','false');};
   large.onerror=failed;timer=setTimeout(failed,15000);large.src=item.originalSrc??item.src;
  }
  function move(delta){const nextPosition=Math.max(0,Math.min(photos.length-1,position+delta));if(nextPosition===position)return;position=nextPosition;select(photos[position].i);show();if(document.activeElement?.disabled)stage.focus({preventScroll:true});}
  back.onclick=()=>move(-1);forward.onclick=()=>move(1);retry.onclick=()=>{show();stage.focus({preventScroll:true});};
  close.onclick=()=>{dialog.close();finish();};
  dialog.addEventListener('cancel',event=>{event.preventDefault();dialog.close();finish();});dialog.addEventListener('close',finish,{once:true});
  dialog.addEventListener('keydown',event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();move(event.key==='ArrowRight'?1:-1);}});
  stage.onpointerdown=event=>{if(!event.isPrimary){gesture=null;return;}if(!event.target.closest('button'))stage.focus({preventScroll:true});gesture={id:event.pointerId,x:event.clientX,y:event.clientY};};
  stage.onpointercancel=()=>{gesture=null;};
  stage.onpointerup=event=>{if(!gesture||gesture.id!==event.pointerId)return;const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;gesture=null;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.25)move(dx<0?1:-1);};
  document.body.append(dialog);openedDialog=dialog;dialog.showModal();show();close.focus({preventScroll:true});
  dialog.cleanup=()=>{dialog.close();finish();};
 }
 frame.onclick=()=>{if(swiped){swiped=false;return;}const item=items[index];if(!item?.src)return;if(failedSrc){failedSrc=null;active=true;img.loading='eager';render(false);return;}if(item.kind==='video'||item.kind==='gif'){window.open(item.url,'_blank','noopener,noreferrer');return;}openViewer();};
 if(managed){observer=new IntersectionObserver(entries=>{active=entries[0].isIntersecting;render(false);},{rootMargin:'1200px 0px'});observer.observe(root);}render(false);return {element:root,select,destroy(){openedDialog?.cleanup();stopLoading();observer?.disconnect();img.onload=img.onerror=null;img.removeAttribute('src');},get index(){return index;}};
};
