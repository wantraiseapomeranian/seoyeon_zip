// Samsung Internet may hide the native date's inner text in forced dark mode.
// Keep the native input (picker, value, labels and validation) as the hit target.
if(/SamsungBrowser\//.test(navigator.userAgent)){
 const fields=[];
 for(const input of document.querySelectorAll('input[type=date]')){
  const wrapper=document.createElement('span'),value=document.createElement('span');
  wrapper.className='date-display';value.className='date-value';value.setAttribute('aria-hidden','true');
  input.before(wrapper);wrapper.append(input,value);fields.push({input,value});
 }
 const sync=()=>{for(const {input,value} of fields)value.textContent=input.value?input.value.replaceAll('-','.'):'날짜 선택';};
 for(const event of ['input','change','click','popstate'])window.addEventListener(event,()=>queueMicrotask(sync));
 window.addEventListener('reset',()=>setTimeout(sync,0));
 sync();
}
