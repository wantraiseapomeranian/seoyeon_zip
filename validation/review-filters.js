// Shared controls for the X and Instagram review pages.
window.reviewFilters=function(onChange){
 const $=selector=>document.querySelector(selector);
 const defaults={date:'',media:'all',author:'',kind:'all'};
 const keys=Object.keys(defaults);
 function active(key){const field=$('#review-'+key);return field&&field.value&&field.value!=='all';}
 function hasFilters(){return keys.some(active);}
 function sizeSelects(){
  const context=document.createElement('canvas').getContext('2d');if(!context)return;
  for(const select of document.querySelectorAll('.review-filters select')){
   const style=getComputedStyle(select);context.font=style.font||style.fontSize+' '+style.fontFamily;
   select.style.width=Math.ceil(context.measureText(select.selectedOptions[0]?.textContent||'').width+parseFloat(style.paddingLeft)+parseFloat(style.paddingRight)+28)+'px';
  }
 }
 function query(){
  sizeSelects();
  const count=['author','kind'].filter(active).length;
  $('#review-more').textContent=count?'필터 · '+count:'필터';
  const params=new URLSearchParams();
  for(const key of keys){const field=$('#review-'+key);if(field)params.set(key,field.value);}
  return '&'+params;
 }
 function updateAuthors(authors=[]){
  const field=$('#review-author'),value=field.value;
  field.replaceChildren(new Option('모든 계정',''),...[...new Set([...authors,...(value?[value]:[])])].sort().map(author=>new Option('@'+author,author)));
  field.value=value;sizeSelects();
 }
 for(const field of document.querySelectorAll('.review-filters input,.review-filters select'))field.addEventListener('change',onChange);
 $('#review-reset').onclick=()=>{
  for(const key of keys){const field=$('#review-'+key);if(field)field.value=defaults[key];}
  onChange();
 };
 $('#review-more').onclick=()=>{
  const button=$('#review-more'),open=button.getAttribute('aria-expanded')!=='true';
  button.setAttribute('aria-expanded',String(open));$('#review-extra').hidden=!open;
 };
 return {hasFilters,query,updateAuthors};
};
