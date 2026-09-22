// Preserve keyboard position through a successful review list replacement.
window.reviewFocus=function(button){
 const card=button.closest('.review-card'),list=card.parentElement;
 const index=[...list.children].indexOf(card),id=card.dataset.reviewId;
 let moved=document.activeElement!==button;
 const track=event=>{if(event.target!==button&&!event.target.closest('.decision-dialog'))moved=true;};
 document.addEventListener('focusin',track);
 const stop=()=>document.removeEventListener('focusin',track);
 return {stop,restore(){
  stop();if(moved)return;
  const cards=[...list.querySelectorAll('.review-card')];
  const next=cards.find(e=>e.dataset.reviewId===id)||cards[Math.min(index,cards.length-1)];
  const target=next?.querySelector('h2')||document.querySelector('#empty:not([hidden]) h2, #youtube-notice');
  if(target){target.tabIndex=-1;target.focus();}
 }};
};
