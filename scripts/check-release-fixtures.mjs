// Loaded only by check:release. Existing scripts remain standalone.
const loopback=input=>{
 const url=new URL(input instanceof Request?input.url:String(input));
 return ['http:','https:'].includes(url.protocol)&&['127.0.0.1','localhost','[::1]'].includes(url.hostname);
};
let denied=false;
const deny=message=>{denied=true;console.error(message);};
process.on('beforeExit',()=>{if(denied)process.exitCode=1;});
const nativeFetch=globalThis.fetch;
globalThis.fetch=async(input,options)=>{
 if(!loopback(input)) {
  const message='Release checks deny external fetch';deny(message);throw new Error(message);
 }
 // Native fetch must not follow a loopback redirect out to a provider.
 return nativeFetch(input,{...options,redirect:'error'});
};

if(process.env.RELEASE_BROWSER_FIXTURES==='1') {
 const {chromium}=await import('playwright');
 const launch=chromium.launch.bind(chromium);
 const fulfillLoopback=async(route,options)=>{
  // Playwright does not route later URLs in a redirect chain. Inspect first.
  const response=await route.fetch({...options,maxRedirects:0});
  if(response.status()>=300&&response.status()<400&&response.headers().location) {
   deny('Release checks deny browser redirects');return route.abort('failed');
  }
  return route.fulfill({response});
 };
 const protectRoutes=target=>{
  const route=target.route.bind(target);
  target.route=(url,handler,options)=>route(url,(requestRoute,request)=>{
   requestRoute.continue=async options=>{
    if(loopback(options?.url??requestRoute.request().url()))return fulfillLoopback(requestRoute,options);
    deny('Release checks deny external browser request');return requestRoute.abort('failed');
   };
   return handler(requestRoute,request);
  },options);
 };
 chromium.launch=async options=>{
  const browser=await launch(options);
  const guarded=new WeakSet();
  const guardContext=async context=>{
   if(guarded.has(context))return;
   guarded.add(context);
   // Later test-specific routes have priority and fulfill their fixture requests.
   await context.route('**/*',async route=>{
    if(loopback(route.request().url()))return fulfillLoopback(route);
    deny('Release checks deny external browser request');await route.abort('failed');
   });
   protectRoutes(context);
   context.on('page',protectRoutes);
   for(const page of context.pages())protectRoutes(page);
  };
  const newContext=browser.newContext.bind(browser);
  browser.newContext=async options=>{const context=await newContext({...options,serviceWorkers:'block'});await guardContext(context);return context;};
  const newPage=browser.newPage.bind(browser);
  browser.newPage=async options=>{const page=await newPage({...options,serviceWorkers:'block'});await guardContext(page.context());return page;};
  return browser;
 };
}
