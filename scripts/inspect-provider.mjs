import { fetchPage,normalizePage } from '../src/collection.mjs';
import { sources } from '../src/sources.mjs';

// Read-only evidence: two pages per source, metadata summaries only.
for(const source of sources) {
  let cursor=null;const seen=new Set();
  for(let number=1;number<=2;number++) {
    try {
      const result=await fetchPage(source.handle,cursor);
      if(result.kind!=='page') throw Error('unexpected_204');
      const page=normalizePage(result.json,source);
      const rows=result.json.results;
      const timestamps=rows.map(r=>Date.parse(r.created_at));
      const report={source:source.handle,page:number,at:result.observation.startedAt,
        http:result.observation.http,received:rows.length,matched:page.posts.length,
        cosmo:page.posts.filter(p=>p.contentKind==='cosmo').length,
        authorDiffers:rows.filter(r=>r.author.screen_name.toLowerCase()!==source.handle.toLowerCase()).length,
        timestampInversions:timestamps.filter((t,i)=>i>0 && t>timestamps[i-1]).length,
        overlap:rows.filter(r=>seen.has(r.id)).length,
        cursorPresent:page.nextCursor!==null,
        cursorChanged:page.nextCursor!==cursor,
        traversalContractVerified:false};
      console.log(JSON.stringify(report));
      rows.forEach(r=>seen.add(r.id));
      if(page.nextCursor===null || page.nextCursor===cursor)break;
      cursor=page.nextCursor;
    } catch(error){console.log(JSON.stringify({source:source.handle,page:number,error:error.code??error.message}));break;}
  }
}
