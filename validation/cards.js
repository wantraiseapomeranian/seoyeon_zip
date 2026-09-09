async function render() {
  const response = await fetch('/api/samples');
  if (!response.ok) throw Error('samples unavailable');
  const {posts,collectedAt} = await response.json();
  const photo = posts.find(p=>p.contentKind==='cosmo' && p.media.some(m=>m.kind==='image')) ?? posts.find(p=>p.media.some(m=>m.kind==='image'));
  const video = posts.find(p=>p.media.some(m=>m.kind==='video'));
  if (!photo || !video) throw Error('missing real image/video sample');
  const samples = [{post:photo,kind:'image'},{post:video,kind:'video'},{post:photo,kind:'image',broken:true}];
  for (const {post,kind,broken} of samples) {
    const media=post.media.find(m=>m.kind===kind);
    const article=document.createElement('article');
    article.dataset.kind=broken?'failure':kind;
    const link=document.createElement('a');
    link.className='preview'; link.href=post.canonicalUrl; link.target='_blank'; link.rel='noopener noreferrer';
    link.setAttribute('aria-label',`${post.authorHandle} ${kind==='video'?'영상':'사진'} 원문 보기 (새 탭)`);
    const image=document.createElement('img'); image.alt=`${post.authorHandle} ${kind==='video'?'영상 썸네일':'사진'}`;
    if(media.width && media.height){image.width=media.width;image.height=media.height;}
    image.addEventListener('error',()=>{
      const fallback=document.createElement('span');fallback.className='placeholder';
      fallback.append(document.createTextNode('미리보기를 불러오지 못했어요.'));
      const action=document.createElement('strong');action.textContent='원문 보기';fallback.append(action);link.replaceChildren(fallback);
      article.dataset.preview='failed';
    },{once:true});
    image.addEventListener('load',()=>{article.dataset.preview='loaded';},{once:true});
    image.src=broken?'/missing-preview.jpg':media.previewUrl ?? '/missing-preview.jpg'; link.append(image);
    if(kind==='video'){const label=document.createElement('span');label.className='video-label';label.textContent='영상 · 원문에서 재생';link.append(label);}
    article.append(link);
    const metadata=document.createElement('div');metadata.className='metadata';
    const author=document.createElement('span');author.className='author';author.textContent=`@${post.authorHandle}`;
    metadata.append(author);article.append(metadata);
    const time=document.createElement('time');time.dateTime=post.publishedAt;time.textContent=new Date(post.publishedAt).toLocaleDateString('ko-KR');article.append(time);
    const source=document.createElement('span');source.className='source';source.textContent=`발견 출처 @${post.observedViaSource}`;article.append(source);
    const caption=document.createElement('p');caption.className='caption';caption.textContent=broken?'이미지 실패 확인 표본':post.caption;article.append(caption);
    document.querySelector('#gallery').append(article);
  }
  document.querySelector('#status').textContent=`실제 수집 표본 · ${new Date(collectedAt).toLocaleString('ko-KR')} 확인`;
}
render().catch(()=>{document.querySelector('#status').textContent='표본을 불러오지 못했어요. 수집 결과를 확인한 뒤 새로고침해 주세요.';});
