import { createRemoteJWKSet, jwtVerify } from 'jose';
import { fetchPage, normalizePage } from './collection.mjs';

const handles = ['gapyeonghaus','Seowoo_0501','tripleSnewsfeed','TRIPLES_FAN_FR','Or1gin030806','First0806_'];
const reply = (value,status=200) => Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});

export async function authorize(request,env) {
  if (!env.POLICY_AUD || !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.TEAM_DOMAIN ?? '') || !env.OWNER_EMAIL) return 503;
  const token=request.headers.get('cf-access-jwt-assertion');
  if (!token) return 401;
  try {
    const {payload}=await jwtVerify(token,createRemoteJWKSet(new URL(`${env.TEAM_DOMAIN}/cdn-cgi/access/certs`)),{issuer:env.TEAM_DOMAIN,audience:env.POLICY_AUD,algorithms:['RS256'],requiredClaims:['exp','iat','email']});
    return payload.email?.toLowerCase()===env.OWNER_EMAIL.toLowerCase()?200:403;
  } catch { return 403; }
}

export default {
  async fetch(request,env) {
    const auth=await authorize(request,env);
    if(auth!==200) return reply({error:auth===503?'private_access_not_configured':'access_denied'},auth);
    const url=new URL(request.url);
    try {
      if(url.pathname==='/api/samples' && request.method==='GET') {
        const {results}=await env.DB.prepare("SELECT data FROM posts ORDER BY json_extract(data,'$.publishedAt') DESC LIMIT 48").all();
        const run=await env.DB.prepare('SELECT finished_at FROM runs ORDER BY finished_at DESC LIMIT 1').first();
        return reply({collectedAt:run?.finished_at??null,posts:results.map(row=>JSON.parse(row.data))});
      }
      if(url.pathname==='/api/probe' && request.method==='POST') {
        if(request.headers.get('origin')!==url.origin || request.headers.get('x-validation-action')!=='collect') return reply({error:'invalid_origin'},403);
        const handle=url.searchParams.get('source');
        if(!handles.includes(handle)) return reply({error:'invalid_source'},400);
        const stateResult=await env.DB.prepare('SELECT * FROM source_state WHERE source=?').bind(handle).all();
        const state=stateResult.results[0];
        const expected=state?.revision??0;
        let fetched;
        try { fetched=await fetchPage(handle,state?.cursor??null); } catch(error) {
          console.log(JSON.stringify({event:'provider_failure',handle,message:String(error.message).slice(0,240)}));
          return reply({error:'provider_unavailable_checkpoint_unchanged'},502);
        }
        let page;
        try { page=normalizePage(fetched.json,{handle,verifiedDirect:false}); } catch { return reply({error:'provider_schema_checkpoint_unchanged'},502); }
        const posts=JSON.stringify(page.posts);
        const media=JSON.stringify(page.posts.flatMap(p=>p.media.map(m=>({...m,postId:p.id}))));
        const token=crypto.randomUUID();
        const statements=[
          env.DB.prepare('INSERT OR IGNORE INTO source_state(source,cursor,revision) VALUES(?,NULL,0)').bind(handle),
          // A stale writer aborts the entire D1 batch through the CHECK constraint.
          env.DB.prepare('INSERT INTO commit_guard(token,ok) VALUES(?,(SELECT revision=? FROM source_state WHERE source=?))').bind(token,expected,handle),
          env.DB.prepare("INSERT INTO posts(id,data) SELECT json_extract(value,'$.id'),value FROM json_each(?) WHERE true ON CONFLICT(id) DO UPDATE SET data=excluded.data").bind(posts),
          env.DB.prepare("DELETE FROM media WHERE post_id IN (SELECT json_extract(value,'$.id') FROM json_each(?))").bind(posts),
          env.DB.prepare("INSERT INTO media(post_id,position,data) SELECT json_extract(value,'$.postId'),json_extract(value,'$.position'),value FROM json_each(?)").bind(media),
          env.DB.prepare("INSERT OR IGNORE INTO discoveries(post_id,source) SELECT json_extract(value,'$.id'),? FROM json_each(?)").bind(handle,posts),
          env.DB.prepare('UPDATE source_state SET cursor=?,revision=revision+1 WHERE source=?').bind(page.nextCursor,handle),
          env.DB.prepare('DELETE FROM commit_guard WHERE token=?').bind(token)
        ];
        let result;
        try { result=await env.DB.batch(statements); } catch(error) {
          return reply({error:/CHECK constraint failed/.test(String(error))?'stale_page':'storage_failure'},/CHECK constraint failed/.test(String(error))?409:500);
        }
        const observation={...fetched.observation,handle,received:page.receivedCount,stored:page.posts.length,sqlStatements:statements.length+2,rowsRead:result.reduce((n,r)=>n+(r.meta.rows_read??0),stateResult.meta.rows_read??0),rowsWritten:result.reduce((n,r)=>n+(r.meta.rows_written??0),stateResult.meta.rows_written??0)};
        const log=await env.DB.prepare('INSERT INTO runs(id,finished_at,data) VALUES(?,?,?)').bind(token,new Date().toISOString(),JSON.stringify(observation)).run();
        observation.rowsRead+=log.meta.rows_read??0;observation.rowsWritten+=log.meta.rows_written??0;
        console.log(JSON.stringify({event:'validation_page',...observation}));
        return reply(observation);
      }
      if(url.pathname.startsWith('/api/')) return reply({error:'not_found'},404);
      if(request.method!=='GET' && request.method!=='HEAD') return reply({error:'method_not_allowed'},405);
      const asset=await env.ASSETS.fetch(request);
      const headers=new Headers(asset.headers);
      headers.set('Cache-Control','private, no-store');
      headers.set('Content-Security-Policy',"default-src 'self'; img-src https://pbs.twimg.com 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
      return new Response(asset.body,{status:asset.status,headers});
    } catch { return reply({error:'validation_failure'},500); }
  }
};
