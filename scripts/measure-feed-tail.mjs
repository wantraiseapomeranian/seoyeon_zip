import { spawn } from 'node:child_process';
// Emit only timing and outcome fields; never print request headers or URLs.
const child=spawn(process.execPath,['node_modules/wrangler/bin/wrangler.js','tail','seoyeon-zip','--format','json'],{stdio:['ignore','pipe','pipe']});
let buffer='';
child.stdout.on('data',chunk=>{
 buffer+=chunk;
 while(true){
 const start=buffer.indexOf('{');if(start<0){buffer='';break;}
 let depth=0,quoted=false,escape=false,end=-1;
 for(let i=start;i<buffer.length;i++){
 const ch=buffer[i];if(quoted){if(escape)escape=false;else if(ch==='\\')escape=true;else if(ch==='"')quoted=false;continue;}
 if(ch==='"')quoted=true;else if(ch==='{')depth++;else if(ch==='}'&&--depth===0){end=i+1;break;}
 }
 if(end<0)break;
 const json=buffer.slice(start,end);buffer=buffer.slice(end);
 try{const e=JSON.parse(json);console.log(JSON.stringify({outcome:e.outcome,cpuTime:e.cpuTime,wallTime:e.wallTime,eventTimestamp:e.eventTimestamp,eventType:e.event?.request?'fetch':e.event?.cron?'cron':'other',timingKeys:Object.keys(e).filter(k=>/cpu|time|duration/i.test(k))}));}catch{}
 }
});
child.stderr.on('data',()=>{});
setTimeout(()=>child.kill(),60000);
child.on('exit',code=>console.log(JSON.stringify({tailExit:code})));
