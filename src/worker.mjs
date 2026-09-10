import {handleManagement} from './management.mjs';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { sources } from './sources.mjs';
import { runDueSource } from './scheduler.mjs';
import { listSources,scheduleRetry } from './collection-state.mjs';
import { readFeed } from './feed.mjs';
import { handleInstagramReview } from './instagram-review.mjs';
import { handleXReview } from './x-review.mjs';
import { maintainX } from './x-maintenance.mjs';
const reply=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});

export async function authorize(request,env) {
  if (!env.POLICY_AUD || !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.TEAM_DOMAIN ?? '') || !env.OWNER_EMAIL) return 503;
  const token=request.headers.get('cf-access-jwt-assertion');
  if (!token) return 401;
  try {
    const {payload}=await jwtVerify(token,createRemoteJWKSet(new URL(`${env.TEAM_DOMAIN}/cdn-cgi/access/certs`)),{issuer:env.TEAM_DOMAIN,audience:env.POLICY_AUD,algorithms:['RS256'],requiredClaims:['exp','iat','email']});
    return payload.email?.toLowerCase()===env.OWNER_EMAIL.toLowerCase()?200:403;
  } catch { return 403; }
}


// Internal router. The public fetch handler always authorizes first.
export async function handleApi(request,env) {
  const url=new URL(request.url);
  if(url.pathname==='/api/export'||url.pathname==='/api/manual-posts'||(request.method==='PATCH'&&/^\/api\/sources\/[A-Za-z0-9_]{1,15}$/.test(url.pathname)))return handleManagement(request,env);
  if(url.pathname==='/api/admin/x')return handleXReview(request,env);
  if(url.pathname==='/api/admin/instagram'||url.pathname.startsWith('/api/admin/instagram/')) return handleInstagramReview(request,env);
  if(url.pathname==='/api/feed' && request.method==='GET') {
    try { return reply(await readFeed(env.DB,url.searchParams)); }
    catch(error) { if(error.status===400)return reply({error:'invalid_feed_query'},400);throw error; }
  }
  if(url.pathname==='/api/probe') return reply({error:'manual_probe_retired'},410);
  if(url.pathname==='/api/samples' && request.method==='GET') {
    const {results}=await env.DB.prepare("SELECT data FROM x_feed_posts ORDER BY json_extract(data,'$.publishedAt') DESC LIMIT 48").all();
    const state=await env.DB.prepare('SELECT MAX(last_success_at) AS latest FROM collection_state').first();
    return reply({collectedAt:state?.latest==null?null:new Date(state.latest*1000).toISOString(),posts:results.map(r=>JSON.parse(r.data))});
  }
  if(url.pathname==='/api/sources' && request.method==='GET') return reply({sources:(await listSources(env.DB)).map(s=>({...s,collection_enabled:env.COLLECTION_ENABLED==='true'&&s.collection_enabled===1}))});
  const retry=url.pathname.match(/^\/api\/sources\/([A-Za-z0-9_]{1,15})\/retry$/);
  if(retry && request.method==='POST') {
    if(request.headers.get('origin')!==url.origin || request.headers.get('x-validation-action')!=='collect') return reply({error:'invalid_origin'},403);
    if(!sources.some(s=>s.handle===retry[1])) return reply({error:'unknown_source'},404);
    if(env.COLLECTION_ENABLED!=='true') return reply({error:'collection_disabled'},409);
    return await scheduleRetry(env.DB,retry[1])?reply({status:'scheduled'},202):reply({error:'source_not_runnable'},409);
  }
  return reply({error:'not_found'},404);
}

export default {
  async scheduled(controller,env,ctx) { if(controller.cron==='1-59/3 * * * *')await maintainX(env);else await runDueSource(env); },
  async fetch(request,env) {
    const auth=await authorize(request,env);
    if(auth!==200) return reply({error:auth===503?'private_access_not_configured':'access_denied'},auth);
    try {
      if(new URL(request.url).pathname.startsWith('/api/')) return await handleApi(request,env);
      if(request.method!=='GET' && request.method!=='HEAD') return reply({error:'method_not_allowed'},405);
      const assetUrl=new URL(request.url);if(assetUrl.pathname==='/')assetUrl.pathname='/feed.html';
      if(assetUrl.pathname==='/admin/instagram'||assetUrl.pathname==='/admin/instagram/')assetUrl.pathname='/instagram.html';
      if(assetUrl.pathname==='/admin/x'||assetUrl.pathname==='/admin/x/')assetUrl.pathname='/x-review';
      const asset=await env.ASSETS.fetch(new Request(assetUrl,request));const headers=new Headers(asset.headers);
      headers.set('Cache-Control','private, no-store');
      headers.set('Content-Security-Policy',"default-src 'self'; img-src https://pbs.twimg.com https://*.cdninstagram.com https://*.fbcdn.net 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
      headers.set('Referrer-Policy','no-referrer');
      return new Response(asset.body,{status:asset.status,headers});
    } catch { return reply({error:'validation_failure'},500); }
  }
};
