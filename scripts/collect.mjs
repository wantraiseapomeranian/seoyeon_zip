import { mkdirSync, writeFileSync } from 'node:fs';
import { fetchPage, normalizePage } from '../src/collection.mjs';
import { openStore, savePage } from '../src/store.mjs';
import { sources } from '../src/sources.mjs';

mkdirSync('.local',{recursive:true});
const db = openStore('.local/validation-v2.sqlite');
const observations = [];
try {
  for (const source of sources) {
    const {handle}=source;
    let cursor = null;
    for (let number=1;number <= (handle==='gapyeonghaus'?5:1);number++) {
      const state = db.prepare('SELECT * FROM source_state WHERE source=?').get(handle);
      try {
      const {kind,json,observation} = await fetchPage(handle,cursor);
      if(kind==='not-modified') throw Error('unexpected_204; checkpoint unchanged');
      const page = normalizePage(json,source);
      savePage(db,handle,page,state?.revision??0);
      observations.push({...observation,handle,received:page.receivedCount,stored:page.posts.length,nextCursor:page.nextCursor,collectionStatus:'success',cosmoRoleStatus:page.posts.some(p=>p.contentKind==='cosmo')?'sample-observed':'pending'});
      cursor=page.nextCursor;
      if (!cursor || page.posts.some(p=>p.contentKind==='cosmo')) break;
      } catch(error) { observations.push({handle,error:error.message,collectionStatus:'needs-attention'}); break; }
    }
  }
  const posts = db.prepare('SELECT data FROM posts ORDER BY json_extract(data,\'$.publishedAt\') DESC').all().map(row=>JSON.parse(row.data));
  writeFileSync('.local/samples.json',JSON.stringify({collectedAt:new Date().toISOString(),posts,observations},null,2));
  console.log(JSON.stringify(observations,null,2));
} finally { db.close(); }
