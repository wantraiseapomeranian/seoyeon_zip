// Restore a trusted D1 SQL export into a NEW local SQLite file. No Worker,
// Cron, provider credentials or remote API are loaded by this script.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,openSync,closeSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const hash=value=>createHash('sha256').update(value).digest('hex');
const quote=name=>'"'+name.replaceAll('"','""')+'"';
const encode=value=>JSON.stringify(value,(_key,v)=>typeof v==='bigint'?{integer:String(v)}:v instanceof Uint8Array?{blob:Buffer.from(v).toString('hex')}:v);

export function verifyRecovery(input,output){
 const sql=readFileSync(input,'utf8');
 // Exclusive creation prevents accidental replacement of an existing database.
 try{closeSync(openSync(output,'wx'));}catch(error){if(error.code==='EEXIST')throw Error('destination_exists');throw error;}
 const started=performance.now(),db=new DatabaseSync(output);
 try{
  // The export can create/insert child tables before parent tables. Enforce
  // referential integrity explicitly after loading the complete isolated copy.
  db.exec('PRAGMA foreign_keys=OFF; BEGIN;');
  db.exec(sql);
  const violations=db.prepare('PRAGMA foreign_key_check').all();
  if(violations.length)throw Error('foreign_key_check_failed');
  const integrity=db.prepare('PRAGMA integrity_check').all();
  if(integrity.length!==1||Object.values(integrity[0])[0]!=='ok')throw Error('integrity_check_failed');
  db.exec('COMMIT; PRAGMA foreign_keys=ON;');
  const schema=db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
  const tables={};
  for(const {name} of schema.filter(row=>row.type==='table')){
   const query=db.prepare(`SELECT * FROM ${quote(name)}`);query.setReadBigInts(true);
   const rows=query.all().map(encode).sort();
   tables[name]={rows:rows.length,sha256:hash(encode(rows))};
  }
  return {integrity:'ok',foreignKeyViolations:0,exportSha256:hash(sql),schemaSha256:hash(encode(schema)),tables,restoreMs:Math.round(performance.now()-started)};
 }catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}
 finally{db.close();}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [input,output]=process.argv.slice(2);
 if(!input||!output||process.argv.length!==4){console.error('Usage: node scripts/verify-recovery.mjs <trusted-export.sql> <new-local.sqlite>');process.exitCode=1;}
 else{
  try{console.log(JSON.stringify(verifyRecovery(input,output),null,2));}
  catch(error){console.error(['destination_exists','foreign_key_check_failed','integrity_check_failed'].includes(error.message)?error.message:'restore_failed');process.exitCode=1;}
 }
}
