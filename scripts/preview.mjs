import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const files = new Map([['/',['validation/index.html','text/html; charset=utf-8']],['/style.css',['validation/style.css','text/css']],['/cards.js',['validation/cards.js','text/javascript']],['/api/samples',['.local/samples.json','application/json']]]);
createServer(async(req,res)=>{
  if(req.headers.host!=='127.0.0.1:4173' || req.method!=='GET'){res.writeHead(403);res.end();return;}
  const file=files.get(req.url);
  if(!file){res.writeHead(404);res.end();return;}
  try {
    const content=await readFile(file[0]);
    res.writeHead(200,{'Content-Type':file[1],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; img-src https://pbs.twimg.com 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"});res.end(content);
  } catch {res.writeHead(503);res.end('Local samples unavailable');}
}).listen(4173,'127.0.0.1',()=>console.log('Local validation: http://127.0.0.1:4173'));
