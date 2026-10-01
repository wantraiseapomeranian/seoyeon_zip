import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync,unlinkSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {instagramKind} from '../src/instagram-kind.mjs';

const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
// Change only classification, and skip records changed since the snapshot.
export function classificationUpdates(rows){
 return rows.flatMap(row=>{
  if(!['instagram_review','manual_posts'].includes(row.table))throw Error('invalid_table');
  const data=JSON.parse(row.data);
  if(data.contentKind&&data.contentKind!=='other')return [];
  const kind=instagramKind({caption:typeof data.caption==='string'?data.caption:'',author:typeof (data.author??data.authorHandle)==='string'?(data.author??data.authorHandle):''});
  if(kind==='other')return [];
  const key=row.table==='instagram_review'?'code':'id';
  return [{table:row.table,kind,sql:`UPDATE ${row.table} SET data=json_set(data,'$.contentKind',${quote(kind)}) WHERE ${key}=${quote(row.key)} AND data=${quote(row.data)};`}];
 });
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const args=process.argv.slice(2);
 if(!args.includes('--remote')||args.some(a=>!['--remote','--apply'].includes(a)))throw Error('Use --remote to preview, add --apply to save.');
 const run=args=>{
  const output=execFileSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute','seoyeon-zip-validation','--remote','--json',...args],{encoding:'utf8',maxBuffer:64*1024*1024});
  // File imports print upload progress before the JSON result, even with --json.
  const start=output.search(/^\[\s*\{/m);if(start<0)throw Error('Missing D1 result');
  const result=JSON.parse(output.slice(start));
  if(result.some(r=>!r.success))throw Error('D1 operation failed');return result;
 };
 const [snapshot]=run(['--command',"SELECT 'instagram_review' AS 'table',code AS key,data FROM instagram_review WHERE COALESCE(json_extract(data,'$.contentKind'),'other')='other' UNION ALL SELECT 'manual_posts',id,data FROM manual_posts WHERE json_extract(data,'$.platform')='instagram' AND COALESCE(json_extract(data,'$.contentKind'),'other')='other'"]);
 const updates=classificationUpdates(snapshot.results),summary={mode:args.includes('--apply')?'apply':'preview',proposed:updates.length,byKind:{},byTable:{}};
 for(const u of updates){summary.byKind[u.kind]=(summary.byKind[u.kind]||0)+1;summary.byTable[u.table]=(summary.byTable[u.table]||0)+1;}
 if(args.includes('--apply')&&updates.length){
  mkdirSync('.local',{recursive:true});let rowsWritten=0;
  for(let i=0;i<updates.length;i+=20){
   const file=`.local/instagram-kind-${process.pid}-${i}.sql`;
   try{writeFileSync(file,updates.slice(i,i+20).map(u=>u.sql).join('\n'));for(const result of run(['--file',file]))rowsWritten+=result.meta?.rows_written??0;}
   finally{unlinkSync(file);}
  }
  // D1 also counts Wrangler's import bookkeeping; this is not a post count.
  summary.databaseRowsWritten=rowsWritten;
 }
 console.log(JSON.stringify(summary));
}
