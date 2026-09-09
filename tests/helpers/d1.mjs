import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

// Executes production SQL; this adapter does not claim Cloudflare runtime equivalence.
export function testDatabase() {
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON');
  for(const name of ['0001_validation.sql','0002_collection_state.sql'])
    sqlite.exec(readFileSync(new URL('../../migrations/'+name,import.meta.url),'utf8'));
  const DB={
    prepare(sql) {
      return {sql,args:[],bind(...args){this.args=args;return this;},
        async all(){return {results:sqlite.prepare(sql).all(...this.args),meta:{rows_read:0,rows_written:0}};},
        async first(){return sqlite.prepare(sql).get(...this.args)??null;},
        async run(){const result=sqlite.prepare(sql).run(...this.args);return {meta:{changes:Number(result.changes),rows_read:0,rows_written:Number(result.changes)}};}};
    },
    async batch(statements) {
      sqlite.exec('BEGIN IMMEDIATE');
      try {const results=[];for(const s of statements) results.push(await s.run());sqlite.exec('COMMIT');return results;}
      catch(e){sqlite.exec('ROLLBACK');throw e;}
    }
  };
  return {sqlite,DB,enable(source='Seowoo_0501'){
    sqlite.exec('UPDATE collection_control SET enabled=1,revision=revision+1');
    sqlite.prepare('UPDATE collection_state SET enabled=1 WHERE source=?').run(source);
  }};
}
