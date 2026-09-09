import { createInterface } from 'node:readline';
let pending='';
for await (const line of createInterface({input:process.stdin})) {
  if (!pending && !line.trim().startsWith('{')) continue;
  pending+=line+'\n';
  try {
    const e=JSON.parse(pending);pending='';
    console.log(JSON.stringify({time:e.eventTimestamp,path:e.event?.request?.url?.split('?')[0],status:e.event?.response?.status,cpuTime:e.cpuTime,wallTime:e.wallTime,outcome:e.outcome,logs:e.logs?.map(l=>l.message)}));
  } catch { if(pending.length>1000000)pending=''; }
}
