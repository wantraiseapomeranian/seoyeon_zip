import {Session} from 'node:inspector/promises';
import {fetchPage,normalizePage} from '../src/collection.mjs';
import {sources} from '../src/sources.mjs';
import {commitPage} from '../src/collection-state.mjs';

// CPU attribution only: Node is not the remote Workers budget. Keep the response in memory.
const source=sources.find(s=>s.handle==='Seowoo_0501');
const fetched=await fetchPage(source.handle);
if(fetched.kind!=='page') throw Error('No profile page');
let bindings=0;
const DB={prepare(){return {bind(...args){bindings+=JSON.stringify(args).length;return this;}};},async batch(){return [];}};
const session=new Session();session.connect();await session.post('Profiler.enable');await session.post('Profiler.start');
const start=performance.now();const iterations=2000;
for(let i=0;i<iterations;i++) await commitPage(DB,{},normalizePage(fetched.json,source),{});
const elapsed=performance.now()-start;
const {profile}=await session.post('Profiler.stop');session.disconnect();
const nodes=new Map(profile.nodes.map(n=>[n.id,n.callFrame]));const counts=new Map();
for(const id of profile.samples??[]){const f=nodes.get(id);const key=`${f.functionName||'(anonymous)'} ${f.url.split('/').pop()}:${f.lineNumber+1}`;counts.set(key,(counts.get(key)??0)+1);}
console.log(JSON.stringify({runtime:'Node CPU attribution, not Worker CPU',received:fetched.json.results.length,iterations,
  msPerPage:elapsed/iterations,bindingCharsPerPage:bindings/iterations,
  topSamples:[...counts].sort((a,b)=>b[1]-a[1]).slice(0,12)},null,2));
