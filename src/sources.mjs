// Verification of direct authorship is independent of automatic collection enablement.
// gapyeonghaus and tripleSnewsfeed were removed on 2026-11-10: low unique yield and high manual-hide load (docs/VALIDATION.md).
export const sources = ['Seowoo_0501','TRIPLES_FAN_FR','Or1gin030806','First0806_','sogeumdwarf','hamhamm806','S2O806','triplescosmos','Pumpkin030806','WEV86_','merongseo806','yeoniverse_bb','wavefunc0806','myeongsim_','GorgeouSeoyeon']
  .map(handle=>({handle,historyOnly:handle==='wavefunc0806',verifiedDirect:['Seowoo_0501','Or1gin030806','First0806_'].includes(handle)}));
// This list is the only authority. A removed handle's collection_state row stays (posts and cursor kept for re-adding) but is never leased or listed.
export const sourceHandlesJson=JSON.stringify(sources.map(({handle})=>handle));
