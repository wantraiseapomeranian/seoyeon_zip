import { DatabaseSync } from 'node:sqlite';

export function openStore(path) {
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS posts(id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS media(post_id TEXT NOT NULL REFERENCES posts(id), position INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(post_id,position));
    CREATE TABLE IF NOT EXISTS discoveries(post_id TEXT NOT NULL REFERENCES posts(id), source TEXT NOT NULL, PRIMARY KEY(post_id,source));
    CREATE TABLE IF NOT EXISTS source_state(source TEXT PRIMARY KEY, cursor TEXT, revision INTEGER NOT NULL);`);
  return db;
}

// Local stage-0 transaction experiment. D1 needs its own measured batch implementation.
export function savePage(db, source, page, expectedRevision) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const state = db.prepare('SELECT revision FROM source_state WHERE source=?').get(source);
    if ((state?.revision ?? 0) !== expectedRevision) throw Error('stale page writer');
    const posts = JSON.stringify(page.posts);
    const media = JSON.stringify(page.posts.flatMap(p => p.media.map(m => ({...m, postId:p.id}))));
    db.prepare(`INSERT INTO posts(id,data) SELECT json_extract(value,'$.id'),value FROM json_each(?) WHERE true
      ON CONFLICT(id) DO UPDATE SET data=excluded.data`).run(posts);
    db.prepare(`DELETE FROM media WHERE post_id IN (SELECT json_extract(value,'$.id') FROM json_each(?))`).run(posts);
    db.prepare(`INSERT INTO media(post_id,position,data) SELECT json_extract(value,'$.postId'),json_extract(value,'$.position'),value FROM json_each(?)`).run(media);
    db.prepare(`INSERT OR IGNORE INTO discoveries(post_id,source) SELECT json_extract(value,'$.id'),? FROM json_each(?)`).run(source,posts);
    db.prepare(`INSERT INTO source_state(source,cursor,revision) VALUES(?,?,?)
      ON CONFLICT(source) DO UPDATE SET cursor=excluded.cursor,revision=excluded.revision`).run(source,page.nextCursor,expectedRevision+1);
    db.exec('COMMIT');
  } catch(error) { db.exec('ROLLBACK'); throw error; }
}
