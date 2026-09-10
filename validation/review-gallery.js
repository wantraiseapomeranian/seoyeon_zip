// Shared photo viewer for the private review inboxes.
window.reviewGallery=function(items,{label='사진',onChange=()=>{}}={}){
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text)n.textContent=text;return n;};
 let index=0,start=null,swiped=false;
 const root=el('div','photo-gallery'),frame=el('button','photo-frame'),img=el('img'),fallback=el('span','photo-fallback','미리보기를 불러올 수 없어요'),controls=el('div','photo-controls'),prev=el('button','photo-arrow','‹'),next=el('button','photo-arrow','›'),count=el('span','photo-count');
 frame.type=prev.type=next.type='button';frame.setAttribute('aria-label',label+' 확대');prev.setAttribute('aria-label',label+' 이전');next.setAttribute('aria-label',label+' 다음');count.setAttribute('aria-live','polite');img.loading='lazy';img.referrerPolicy='no-referrer';frame.append(img,fallback);controls.append(prev,count,next);root.append(frame,controls);
 function render(notify=true){const item=items[index];img.hidden=!item?.src;fallback.hidden=!!item?.src;frame.disabled=!item?.src;if(item?.src){img.src=item.src;img.alt=item.alt??label;}else img.removeAttribute('src');count.textContent=items.length?`${label==='후보'?'후보 ':''}${index+1} / ${items.length}`:'사진 없음';prev.hidden=next.hidden=items.length<=1;prev.disabled=index===0;next.disabled=index>=items.length-1;if(notify)onChange(index,item);}
 img.onerror=()=>{img.hidden=true;fallback.hidden=false;};
 const select=(i,notify=true)=>{index=Math.max(0,Math.min(items.length-1,i));render(notify);};prev.onclick=()=>select(index-1);next.onclick=()=>select(index+1);
 root.onkeydown=e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();select(index+(e.key==='ArrowRight'?1:-1));}};
 frame.onpointerdown=e=>{start={x:e.clientX,y:e.clientY};swiped=false;};frame.onpointerup=e=>{if(!start)return;const dx=e.clientX-start.x,dy=e.clientY-start.y;start=null;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)){swiped=true;select(index+(dx<0?1:-1));}};frame.onpointercancel=()=>{start=null;};
 frame.onclick=()=>{if(swiped){swiped=false;return;}const item=items[index];if(!item?.src)return;const dialog=el('dialog','photo-dialog'),close=el('button','photo-close','닫기'),large=el('img');large.src=item.src;large.alt=item.alt??label;close.type='button';close.onclick=()=>dialog.close();dialog.append(close,large);if(item.url){const source=el('a',null,'원문 보기 ↗');source.href=item.url;source.target='_blank';source.rel='noopener noreferrer';dialog.append(source);}dialog.addEventListener('close',()=>{dialog.remove();frame.focus();},{once:true});document.body.append(dialog);dialog.showModal();};
 render(false);return {element:root,select,get index(){return index;}};
};
