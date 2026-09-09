import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const port=Number(process.env.PORT||4173);
const files = new Map([['/',['validation/index.html','text/html; charset=utf-8']],['/style.css',['validation/style.css','text/css']],['/cards.js',['validation/cards.js','text/javascript']],['/api/samples',['.local/samples.json','application/json']]]);
files.set('/feed.html',['validation/feed.html','text/html; charset=utf-8']);
files.set('/feed.css',['validation/feed.css','text/css']);
files.set('/feed.js',['validation/feed.js','text/javascript']);
files.set('/api/sources',['.local/feed-sources.json','application/json']);
createServer(async(req,res)=>{
  if(req.headers.host!==`127.0.0.1:${port}` || req.method!=='GET'){res.writeHead(403);res.end();return;}
  const pathname=new URL(req.url,'http://127.0.0.1:4173').pathname;
  const file=pathname==='/api/samples' && req.headers.referer?.includes('/feed.html')?['.local/feed-samples.json','application/json']:files.get(pathname);
  if(!file){res.writeHead(404);res.end();return;}
  try {
    const content=await readFile(file[0]);
    res.writeHead(200,{'Content-Type':file[1],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; img-src https://pbs.twimg.com 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"});res.end(content);
  } catch {res.writeHead(503);res.end('Local samples unavailable');}
}).listen(port,'127.0.0.1',()=>console.log(`Local validation: http://127.0.0.1:${port}`));
