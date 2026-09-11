import {publicSource,publicPost} from './public-data.mjs';
import {handleManagement} from './management.mjs';
import {syncInstagram,instagramSyncStatus} from './instagram-sync.mjs';
import { authorize,authorizeOwnerContext } from './access.mjs';
import { handleReviewAudit } from './review-audit-api.mjs';
import { sources } from './sources.mjs';
import { runDueSource } from './scheduler.mjs';
import { listSources,scheduleRetry } from './collection-state.mjs';
import { readFeed } from './feed.mjs';
import { handleInstagramReview } from './instagram-review.mjs';
import { handleXReview } from './x-review.mjs';
import { maintainX } from './x-maintenance.mjs';
const reply=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const privateReply=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});

export { authorize } from './access.mjs';


// Internal router. fetch enforces owner authentication except for explicit public reads.
export async function handleApi(request,env,context) {
  const url=new URL(request.url);
  if(url.pathname==='/api/export'||url.pathname==='/api/manual-posts'||(request.method==='PATCH'&&/^\/api\/sources\/[A-Za-z0-9_]{1,15}$/.test(url.pathname)))return handleManagement(request,env);
  if(url.pathname==='/api/admin/review-audit'||url.pathname.startsWith('/api/admin/review-audit/'))return handleReviewAudit(request,env,context);
  if(url.pathname==='/api/admin/x')return handleXReview(request,env,context);
  if(url.pathname==='/api/admin/instagram/sync'&&request.method==='GET')return reply(await instagramSyncStatus(env));
  if(url.pathname==='/api/admin/instagram'||url.pathname.startsWith('/api/admin/instagram/')) return handleInstagramReview(request,env,context);
  if(url.pathname==='/api/feed' && request.method==='GET') {
    try { const data=await readFeed(env.DB,url.searchParams);return reply({...data,posts:data.posts.map(publicPost)}); }
    catch(error) { if(error.status===400)return reply({error:'invalid_feed_query'},400);throw error; }
  }
  if(url.pathname==='/api/probe') return reply({error:'manual_probe_retired'},410);
  if(url.pathname==='/api/samples' && request.method==='GET') {
    const {results}=await env.DB.prepare("SELECT data FROM x_feed_posts ORDER BY json_extract(data,'$.publishedAt') DESC LIMIT 48").all();
    const state=await env.DB.prepare('SELECT MAX(last_success_at) AS latest FROM collection_state').first();
    return reply({collectedAt:state?.latest==null?null:new Date(state.latest*1000).toISOString(),posts:results.map(r=>JSON.parse(r.data))});
  }
  if(url.pathname==='/api/collection-status' && request.method==='GET') return reply({sources:(await listSources(env.DB)).map(s=>publicSource({...s,collection_enabled:env.COLLECTION_ENABLED==='true'&&s.collection_enabled===1}))});
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
  async scheduled(controller,env,ctx) { if(controller.cron==='2-59/5 * * * *')console.log(JSON.stringify({event:'instagram_sync',...await syncInstagram(env)}));else if(controller.cron==='1-59/3 * * * *')await maintainX(env);else await runDueSource(env); },
  async fetch(request,env) {
    const url=new URL(request.url);
    const publicAssets=new Set(['/','/feed','/feed.html','/feed.css','/feed.js','/review-gallery.js','/favicon.ico','/favicon-16.png','/favicon-32.png','/manifest.webmanifest','/apple-touch-icon.png','/app-icon-192.png','/app-icon-512.png']);
    const publicApis=new Set(['/api/feed','/api/collection-status','/api/session']);
    const publicRequest=env.PUBLIC_FEED_ENABLED==='true'&&((['GET','HEAD'].includes(request.method)&&publicAssets.has(url.pathname))||(request.method==='GET'&&publicApis.has(url.pathname)));
    let auth,context;
    if(publicRequest&&publicApis.has(url.pathname)) {
      try {
        // Cloudflare supplies this header. Do not use client-controlled forwarding headers.
        const {success}=await env.PUBLIC_RATE_LIMITER.limit({key:'seoyeon-zip:public:'+(request.headers.get('CF-Connecting-IP')||'unknown')});
        if(!success) {
          const response=privateReply({error:'rate_limited'},429);
          response.headers.set('Retry-After','60');return response;
        }
      } catch { return privateReply({error:'rate_limit_unavailable'},503); }
    }
    if(publicRequest&&url.pathname==='/api/session') {
      auth=await authorize(request,env);
      if(auth===503)return privateReply({error:'private_access_not_configured'},503);
      return privateReply({role:auth===200?'owner':'visitor'},200);
    }
    if(!publicRequest) {
      context=await authorizeOwnerContext(request,env);auth=context.status;
      if(auth!==200)return reply({error:auth===503?'private_access_not_configured':'access_denied'},auth);
      if(url.pathname==='/api/session'&&request.method==='GET')return privateReply({role:'owner'},200);
    }
    try {
      if(url.pathname.startsWith('/api/')) return await handleApi(request,env,context);
      if(request.method!=='GET' && request.method!=='HEAD') return reply({error:'method_not_allowed'},405);
      if(!publicRequest&&(url.pathname==='/admin'||url.pathname==='/admin/'))return new Response(null,{status:302,headers:{Location:new URL('/',url),'Cache-Control':'private, no-store'}});
      const assetUrl=new URL(request.url);if(assetUrl.pathname==='/')assetUrl.pathname='/feed.html';
      if(assetUrl.pathname==='/admin/instagram'||assetUrl.pathname==='/admin/instagram/')assetUrl.pathname='/instagram.html';
      if(assetUrl.pathname==='/admin/x'||assetUrl.pathname==='/admin/x/')assetUrl.pathname='/x-review';
      if(assetUrl.pathname==='/admin/review-history'||assetUrl.pathname==='/admin/review-history/')assetUrl.pathname='/review-history.html';
      const asset=await env.ASSETS.fetch(new Request(assetUrl,request));const headers=new Headers(asset.headers);
      headers.set('Cache-Control','private, no-store');
      headers.set('Content-Security-Policy',"default-src 'self'; img-src https://pbs.twimg.com https://*.cdninstagram.com https://*.fbcdn.net 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
      headers.set('Referrer-Policy','no-referrer');
      return new Response(asset.body,{status:asset.status,headers});
    } catch { return reply({error:'validation_failure'},500); }
  }
};
