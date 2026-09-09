// Verification of direct authorship is independent of automatic collection enablement.
export const sources = ['gapyeonghaus','Seowoo_0501','tripleSnewsfeed','TRIPLES_FAN_FR','Or1gin030806','First0806_','sogeumdwarf','hamhamm806','S2O806','triplescosmos','Pumpkin030806']
  .map(handle=>({handle,verifiedDirect:['Seowoo_0501','Or1gin030806','First0806_'].includes(handle)}));
