// Samsung forced dark mode and iOS date fields may hide native inner text.
// Keep the native input (picker, value, labels and validation) as the hit target.
const needsDateText=/SamsungBrowser\/|iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
if(needsDateText){
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
