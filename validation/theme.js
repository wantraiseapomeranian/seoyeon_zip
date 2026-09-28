// Independent async settings UI. The hash-authorized HTML bootstrap resolves first paint.
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
    launcher.setAttribute('aria-label','화면 설정');
    launcher.innerHTML=icons.settings+'<span class="icon-tooltip" aria-hidden="true">화면 설정</span>';
    dialog=document.createElement('dialog');dialog.id='theme-dialog';dialog.setAttribute('aria-labelledby','theme-title');
    dialog.innerHTML=`<div class="theme-heading"><h2 id="theme-title">화면 설정</h2><button type="button" class="theme-close" aria-label="화면 설정 닫기">닫기</button></div><fieldset><legend>화면 스타일</legend><div class="theme-options">${[['light','밝게'],['dark','어둡게'],['system','기기 설정']].map(([value,label])=>`<label class="theme-choice"><input type="radio" name="site-theme" value="${value}">${icons[value]}<span>${label}</span></label>`).join('')}</div></fieldset><p class="theme-status" role="status"></p>`;
    if(/SamsungBrowser\//i.test(navigator.userAgent)){
      const help=document.createElement('details');help.className='theme-help';
      help.innerHTML='<summary>밝게 선택해도 어둡게 보이나요?</summary><p>삼성 브라우저의 강제 다크 설정이 켜져 있으면 밝게 선택해도 어둡게 보일 수 있어요.</p><ol><li>삼성 브라우저 설정에서 <strong>어두운 화면 모드</strong>를 열어주세요.</li><li><strong>웹 콘텐츠에 어두운 화면 모드 강제 적용</strong>을 꺼주세요.</li><li>이 페이지를 새로고침해 주세요.</li></ol><p>폰 설정 따름은 그대로 두셔도 돼요.</p>';
      dialog.append(help);
    }
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
    // Pointer focus must not move the target before its click is dispatched.
    let keyboardFocus=false;
    document.addEventListener('keydown',()=>{keyboardFocus=true;},true);
    document.addEventListener('pointerdown',()=>{keyboardFocus=false;},true);
    document.addEventListener('focusin',event=>{
      if(!keyboardFocus||event.target===launcher||event.target.closest('dialog'))return;
      const r=event.target.getBoundingClientRect(),b=launcher.getBoundingClientRect();
      if(r.bottom>b.top&&r.top<b.bottom&&r.right>b.left&&r.left<b.right)event.target.scrollIntoView({block:'center'});
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
