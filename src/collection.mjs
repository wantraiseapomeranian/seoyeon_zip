import { Buffer } from 'node:buffer';
const handlePattern = /^[A-Za-z0-9_]{1,15}$/;
export const matchesSeoyeon = text => /(?<![\p{L}\p{N}])(?:윤서연|seo\s?yeon|서연|ソヨン)(?![\p{L}\p{N}])/iu.test(text.normalize('NFKC'));

export function normalizePage(json, source) {
  if (json.code !== 200 || !Array.isArray(json.results) || !json.cursor ||
      !(json.cursor.bottom === null || typeof json.cursor.bottom === 'string')) throw Error('Invalid provider page');
  if (!handlePattern.test(source.handle)) throw Error('Invalid source');
  const posts = [];
  for (const p of json.results) {
    if (p.type !== 'status' || typeof p.id !== 'string' || !/^\d+$/.test(p.id) ||
        !handlePattern.test(p.author?.screen_name ?? '') || typeof p.text !== 'string' ||
        !Number.isFinite(Date.parse(p.created_at))) throw Error('Invalid post; page not committed');
    const url = new URL(p.url);
    const author = p.author.screen_name;
    if (url.protocol !== 'https:' || url.hostname !== 'x.com' || url.port || url.username || url.password ||
        url.pathname.toLowerCase() !== `/${author}/status/${p.id}`.toLowerCase()) throw Error('Invalid canonical URL');
    const relationship = p.quote || p.is_quote_status || p.quoted_status
      ? 'quote' : author.toLowerCase() !== source.handle.toLowerCase() || p.retweeted_status || p.is_retweet || p.reposted_by
        ? 'repost' : p.reposted_by === null ? 'direct' : 'unknown';
    const textMatch = matchesSeoyeon(p.text);
    const directMatch = source.verifiedDirect && relationship === 'direct';
    const rawMedia = p.media?.all ?? [];
    if (!Array.isArray(rawMedia)) throw Error('Invalid media');
    const media = rawMedia.map((m, position) => {
      if (!['photo', 'video', 'gif'].includes(m.type)) throw Error('Unknown media type');
      const previewUrl = m.type === 'photo' ? m.url : m.thumbnail_url ?? null;
      if (previewUrl !== null) {
        const preview = new URL(previewUrl);
        if (preview.protocol !== 'https:' || preview.hostname !== 'pbs.twimg.com' || preview.port || preview.username || preview.password) throw Error('Invalid preview URL');
      }
      return { position, kind: m.type === 'photo' ? 'image' : m.type, previewUrl,
        width: Number.isSafeInteger(m.width) && m.width > 0 ? m.width : null,
        height: Number.isSafeInteger(m.height) && m.height > 0 ? m.height : null };
    });
    if (!(textMatch || directMatch) || !media.length) continue;
    posts.push({ id: `x:${p.id}`, platformPostId: p.id, canonicalUrl: url.origin + url.pathname,
      authorHandle: author, observedViaSource: source.handle, relationship,
      publishedAt: new Date(p.created_at).toISOString(), caption: p.text,
      matchReason: textMatch ? 'text' : 'verified-direct-author', contentKind: /cosmo/i.test(p.text) ? 'cosmo' : directMatch ? 'fansite' : 'other', media });
  }
  return { posts, receivedCount: json.results.length, nextCursor: json.cursor.bottom };
}

export async function fetchPage(handle, cursor = null) {
  if (!handlePattern.test(handle)) throw Error('Invalid handle');
  const url = new URL(`https://api.fxtwitter.com/2/profile/${handle}/statuses`);
  url.searchParams.set('count','10');
  if (cursor) url.searchParams.set('cursor',cursor);
  const startedAt = new Date().toISOString();
  const start = performance.now();
  // FxEmbed rejects requests without an identifying User-Agent (HTTP 401).
  const response = await fetch(url,{
    headers:{'User-Agent':'SeoyeonZip/0.1 (+https://seoyeon-zip.seoyeon-archive.workers.dev)'},
    signal:AbortSignal.timeout(15000),redirect:'manual'
  });
  if (!response.ok || response.status === 204) throw Error(`Provider HTTP ${response.status}; checkpoint unchanged`);
  let bytes = 0; const chunks = [];
  const reader = response.body.getReader();
  while (true) {
    const {done,value} = await reader.read(); if (done) break;
    bytes += value.byteLength;
    if (bytes > 2 * 1024 * 1024) { await reader.cancel(); throw Error('Response exceeds 2MiB'); }
    chunks.push(value);
  }
  const json = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (json.code !== 200) throw Error(`Provider JSON ${json.code}; checkpoint unchanged`);
  return { json, observation: { startedAt, url:String(url), http:response.status, code:json.code, bytes, wallMs:Math.round(performance.now()-start) } };
}
