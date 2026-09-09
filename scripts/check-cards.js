async page => {
  await page.reload();
  await page.waitForFunction(() => document.querySelectorAll('article').length === 3 && [...document.querySelectorAll('article')].every(x=>x.dataset.preview), {timeout:20000});
  const rows=[];
  for(const width of [1440,390,360]) {
    await page.setViewportSize({width,height:1000});
    const state=await page.evaluate(()=>({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,cards:[...document.querySelectorAll('article')].map(x=>({kind:x.dataset.kind,state:x.dataset.preview,width:x.querySelector('img')?.naturalWidth??0,link:x.querySelector('a').href,rel:x.querySelector('a').rel}))}));
    if(state.overflow || state.cards[0].state!=='loaded' || state.cards[1].state!=='loaded' || state.cards[2].state!=='failed') throw Error(JSON.stringify(state));
    rows.push(state);
    await page.screenshot({path:`.local/cards-${width}.png`,fullPage:true});
  }
  await page.locator('body').click({position:{x:2,y:2}});
  const focus=[];
  for(let i=0;i<3;i++){await page.keyboard.press('Tab');focus.push(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')));}
  if(focus.some(x=>!x?.includes('원문 보기'))) throw Error('Keyboard order failed: '+JSON.stringify(focus));
  return {rows,focus};
}
