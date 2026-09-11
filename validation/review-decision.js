(() => {
  const reasons = {
    NOT_SEOYEON:'서연이 아닌 사진', PRODUCT_IMAGE:'상품 사진', EVENT_NOTICE:'행사 안내',
    ADVERTISEMENT:'광고·홍보', DUPLICATE_IMAGE:'같은 사진', DISTINCT_IMAGE:'서로 다른 사진',
    FALSE_POSITIVE:'자동 판정 오류', SEOYEON_CONFIRMED:'서연 확인', SOURCE_DELETED:'원문 삭제',
    RETURN_TO_AUTO:'자동 기준으로 복귀', NEEDS_REVIEW:'추가 검토 필요', GROUP_CORRECTION:'사진 묶음 수정', OTHER:'기타'
  };
  const choices = {
    visible:['SEOYEON_CONFIRMED','FALSE_POSITIVE','OTHER'], kept:['SEOYEON_CONFIRMED','FALSE_POSITIVE','OTHER'],
    hidden:['OTHER','NOT_SEOYEON','PRODUCT_IMAGE','EVENT_NOTICE','ADVERTISEMENT','DUPLICATE_IMAGE','SOURCE_DELETED'],
    excluded:['OTHER','NOT_SEOYEON','PRODUCT_IMAGE','EVENT_NOTICE','ADVERTISEMENT','DUPLICATE_IMAGE','SOURCE_DELETED'],
    auto:['RETURN_TO_AUTO','OTHER'], pending:['NEEDS_REVIEW','OTHER'], held:['NEEDS_REVIEW','OTHER'],
    merge:['DUPLICATE_IMAGE','OTHER'], different:['DISTINCT_IMAGE','FALSE_POSITIVE','OTHER'], unmerge:['GROUP_CORRECTION','FALSE_POSITIVE','OTHER']
  };
  let active = false;
  const make = (tag,text) => { const n=document.createElement(tag);if(text)n.textContent=text;return n; };
  window.reviewReasonLabels = reasons;
  // Keep a submitted payload unchanged while its result is uncertain. A retry is
  // the same logical request, including revision, reason and requestId.
  window.reviewDecision = ({action,label,submit}) => {
    if(active)return Promise.resolve(false);
    active=true;
    return new Promise(resolve => {
      const opener=document.activeElement, dialog=make('dialog'), form=make('form');
      dialog.className='decision-dialog';dialog.setAttribute('aria-labelledby','decision-title');
      const heading=make('h2',label+' 이유');heading.id='decision-title';
      const reasonLabel=make('label','이유'),select=make('select');select.id='decision-reason';reasonLabel.htmlFor=select.id;
      for(const code of choices[action]||['OTHER'])select.add(new Option(reasons[code],code));
      const noteLabel=make('label','메모 (선택)'),note=make('textarea');note.id='decision-note';note.rows=4;note.maxLength=1000;noteLabel.htmlFor=note.id;
      const hint=make('p','최대 1,000자. 저장한 변경과 이유가 검토 내역에 남아요.');hint.className='review-note';hint.id='decision-hint';note.setAttribute('aria-describedby',hint.id);
      const error=make('p');error.id='decision-error';error.setAttribute('role','alert');
      const controls=make('div'),cancel=make('button','취소'),save=make('button','판단 저장');controls.className='review-buttons';cancel.type='button';save.type='submit';save.className='primary';
      controls.append(cancel,save);form.append(heading,reasonLabel,select,noteLabel,note,hint,error,controls);dialog.append(form);document.body.append(dialog);
      let sending=false,payload=null,done=false;
      const finish=value=>{if(done)return;done=true;dialog.close();dialog.remove();active=false;resolve(value);queueMicrotask(()=>{if(opener?.isConnected)opener.focus();});};
      cancel.onclick=()=>finish(false);
      dialog.addEventListener('cancel',event=>{event.preventDefault();if(!sending)finish(false);});
      form.onsubmit=async event=>{
        event.preventDefault();if(sending)return;
        payload ||= {requestId:crypto.randomUUID(),reasonCode:select.value,note:note.value.trim()||null};
        sending=true;save.disabled=true;cancel.disabled=true;select.disabled=true;note.disabled=true;error.textContent='';save.textContent='저장 중…';
        try{await submit(payload);finish(true);}catch(e){
          const conflict=e.status===409,outdated=e.code==='review_client_outdated';
          error.textContent=conflict?'다른 화면에서 변경됐어요. 이 창을 닫고 검토함을 새로고침해 주세요.':outdated?'검토 화면이 업데이트됐어요. 페이지를 새로고침해 주세요.':(e.message||'저장 결과를 확인하지 못했어요.')+' 같은 요청으로 다시 시도할 수 있어요.';
          save.textContent='같은 요청 다시 시도';save.disabled=conflict||outdated;cancel.textContent='닫기';cancel.disabled=false;error.tabIndex=-1;error.focus();
        }finally{sending=false;}
      };
      dialog.showModal();select.focus();
    });
  };
})();
