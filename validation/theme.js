// Runs before stylesheets so a saved theme is resolved before the first paint.
(() => {
  const key='seoyeon-theme', root=document.documentElement;
  const system=window.matchMedia('(prefers-color-scheme: dark)');
  const valid=value=>['light','dark','system'].includes(value)?value:'light';
  let preference='light', dialog, launcher;
  try{preference=valid(localStorage.getItem(key));}catch{}
  function apply(){
    const dark=preference==='dark'||(preference==='system'&&system.matches);
    root.dataset.theme=dark?'dark':'light';
    let meta=document.querySelector('meta[name="theme-color"]');
    if(!meta){meta=document.createElement('meta');meta.name='theme-color';document.head.append(meta);}
    meta.content=dark?'#192127':'#F1F5F7';
    if(dialog){
      for(const radio of dialog.querySelectorAll('input'))radio.checked=radio.value===preference;
      dialog.querySelector('.theme-status').textContent=preference==='system'
        ?`기기 설정을 따라 ${dark?'어둡게':'밝게'} 표시 중`:'선택한 화면 스타일을 기억해요.';
    }
  }
  apply();
  system.addEventListener('change',()=>{if(preference==='system')apply();});
  window.addEventListener('storage',event=>{
    if(event.key!==key&&event.key!==null)return;
    preference=valid(event.newValue);apply();
  });
  // Restore the current preference after a back/forward cache navigation as well.
  window.addEventListener('pageshow',event=>{if(event.persisted){try{preference=valid(localStorage.getItem(key));}catch{}apply();}});
  function mount(){
    const svg=content=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${content}</svg>`;
    const icons={
      light:svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>'),
      dark:svg('<path d="M20.5 13.2A8.5 8.5 0 0 1 10.8 3.5 8.5 8.5 0 1 0 20.5 13.2Z"/>'),
      system:svg('<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/>'),
      settings:svg('<path d="M4 7h7m4 0h5M4 17h3m4 0h9"/><circle cx="13" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>')
    };
    launcher=document.createElement('button');launcher.type='button';launcher.className='theme-launch';
    launcher.setAttribute('aria-haspopup','dialog');launcher.setAttribute('aria-controls','theme-dialog');launcher.setAttribute('aria-expanded','false');
    launcher.innerHTML=icons.settings+'<span>화면 설정</span>';
    dialog=document.createElement('dialog');dialog.id='theme-dialog';dialog.setAttribute('aria-labelledby','theme-title');
    dialog.innerHTML=`<div class="theme-heading"><h2 id="theme-title">화면 설정</h2><button type="button" class="theme-close" aria-label="화면 설정 닫기">닫기</button></div><fieldset><legend>화면 스타일</legend><div class="theme-options">${[['light','밝게'],['dark','어둡게'],['system','기기 설정']].map(([value,label])=>`<label class="theme-choice"><input type="radio" name="site-theme" value="${value}">${icons[value]}<span>${label}</span></label>`).join('')}</div></fieldset><p class="theme-status" role="status"></p>`;
    document.body.append(launcher,dialog);root.classList.add('has-theme-control');apply();
    launcher.addEventListener('click',()=>{dialog.showModal();launcher.setAttribute('aria-expanded','true');dialog.querySelector('input:checked').focus();});
    dialog.querySelector('.theme-close').addEventListener('click',()=>dialog.close());
    dialog.addEventListener('close',()=>{launcher.setAttribute('aria-expanded','false');launcher.focus({preventScroll:true});});
    dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
    dialog.addEventListener('change',event=>{
      if(!event.target.matches('input[name="site-theme"]'))return;
      preference=valid(event.target.value);let stored=true;
      try{localStorage.setItem(key,preference);}catch{stored=false;}
      apply();if(!stored)dialog.querySelector('.theme-status').textContent='현재 화면에 적용했어요. 이 브라우저에서는 선택을 저장할 수 없어요.';
    });
    // A floating control must not obscure a keyboard-focused action underneath it.
    document.addEventListener('focusin',event=>{
      if(event.target===launcher||event.target.closest('dialog'))return;
      const r=event.target.getBoundingClientRect(),b=launcher.getBoundingClientRect();
      if(r.bottom>b.top&&r.top<b.bottom&&r.right>b.left&&r.left<b.right)event.target.scrollIntoView({block:'center'});
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
