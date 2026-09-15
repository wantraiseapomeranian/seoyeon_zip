import test from 'node:test';
import assert from 'node:assert/strict';
import {testDatabase} from './helpers/d1.mjs';
const alerts=await import('../src/operations-alerts.mjs').catch(()=>({}));
const start=Date.parse('2026-09-15T03:00:00Z');
const signals=(status='healthy')=>({x:{sources:[{source:'Seowoo_0501',status}]},instagram:{status:'disabled',pendingErrors:0,overdue:0},manual:{enabled:false,counts:{failed:0},overdue:0}});
function setup(){
 assert.equal(typeof alerts.evaluateOperationsAlerts,'function');
 const db=testDatabase();
 db.sqlite.exec("INSERT INTO operations_history(day,captured_at,x_total,instagram_total,manual_total,query_version,query_status) VALUES('2026-09-15','2026-09-15T00:00:00Z',0,0,0,'x-review-v1','ok')");
 return {...db,run:(seconds,status='retry')=>alerts.evaluateOperationsAlerts({DB:db.DB},async()=>typeof status==='string'?signals(status):status,start+seconds*1000),read:()=>alerts.readOperationsAlerts(db.DB,start)};
}

test('sustained problems emit once, confirmed recovery emits once, recurrence opens again',async()=>{
 const d=setup();assert.equal((await d.read()).checkedAt,null);
 await d.run(0);await d.run(300);await d.run(600);assert.equal((await d.read()).active.length,0);
 await d.run(900);await d.run(1200);let result=await d.read();assert.equal(result.active.length,1);assert.deepEqual(result.events.map(e=>e.type),['problem']);
 await d.run(1500,'healthy');await d.run(1500,'healthy');assert.equal((await d.read()).active.length,1);
 await d.run(1800,'healthy');await d.run(2100,'healthy');result=await d.read();assert.equal(result.active.length,0);assert.deepEqual(result.events.map(e=>e.type),['recovered','problem']);
 await d.run(2400);await d.run(3300);assert.deepEqual((await d.read()).events.map(e=>e.type),['problem','recovered','problem']);
});

test('unknown states, missing signals and evaluator gaps break confirmation continuity',async()=>{
 const d=setup();await d.run(0);await d.run(600,'running');await d.run(900);await d.run(1500);assert.equal((await d.read()).active.length,0);
 await d.run(1800);assert.equal((await d.read()).active.length,1);
 await d.run(2100,'healthy');await d.run(2400,{});await d.run(2700,'healthy');assert.equal((await d.read()).active.length,1);
 await d.run(3901,'healthy');assert.equal((await d.read()).active.length,1);await d.run(4201,'healthy');assert.equal((await d.read()).active.length,0);
 await d.run(4501);await d.run(5702);assert.equal((await d.read()).active.length,0);await d.run(6602);assert.equal((await d.read()).active.length,1);
});

test('disabled or completed monitoring closes as stopped, never recovered',async()=>{
 for(const state of ['disabled','completed']){const d=setup();await d.run(0);await d.run(900);await d.run(1200,state);await d.run(1500,state);assert.deepEqual((await d.read()).events.map(e=>e.type),['stopped','problem']);}
});

test('Instagram persisted errors remain bad during running and manual failures are grouped',async()=>{
 const d=setup(),value=signals();value.instagram={status:'running',pendingErrors:1,overdue:0};value.manual={enabled:true,counts:{failed:3},overdue:0};
 await d.run(0,value);await d.run(900,value);assert.deepEqual((await d.read()).active.map(a=>a.key),['instagram','manual']);
 value.instagram.pendingErrors=0;value.manual.overdue=1;value.manual.counts.failed=0;await d.run(1200,value);await d.run(1500,value);assert.equal((await d.read()).active.length,2);
});

test('lease is acquired before reading signals and concurrent/same timestamp calls do not duplicate transitions',async()=>{
 const d=setup();await d.run(0);let release;const gate=new Promise(resolve=>{release=resolve;});let entered;const ready=new Promise(resolve=>{entered=resolve;});
 const first=alerts.evaluateOperationsAlerts({DB:d.DB},async()=>{entered();await gate;return signals('retry');},start+900000);await ready;
 const skipped=await alerts.evaluateOperationsAlerts({DB:d.DB},async()=>{throw Error('must not load while leased');},start+900000);assert.equal(skipped.status,'skipped');release();await first;
 await d.run(900);assert.equal((await d.read()).events.length,1);
});

test('expired owner cannot write or release a newer owner lease',async()=>{
 const d=setup();await d.run(0);let release;const gate=new Promise(resolve=>{release=resolve;});let entered;const ready=new Promise(resolve=>{entered=resolve;});
 const stale=alerts.evaluateOperationsAlerts({DB:d.DB},async()=>{entered();await gate;return signals('healthy');},start+900000);await ready;
 d.sqlite.exec('UPDATE operations_alert_monitor SET lease_until=0');await d.run(900);release();assert.equal((await stale).status,'skipped');assert.equal((await d.read()).active.length,1);
});

test('expired owner cannot release an in-progress successor lease',async()=>{
 const d=setup();let releaseOld,releaseNew,enteredOld,enteredNew;
 const oldGate=new Promise(r=>{releaseOld=r;}),newGate=new Promise(r=>{releaseNew=r;});
 const oldReady=new Promise(r=>{enteredOld=r;}),newReady=new Promise(r=>{enteredNew=r;});
 const old=alerts.evaluateOperationsAlerts({DB:d.DB},async()=>{enteredOld();await oldGate;return signals('retry');},start);await oldReady;
 d.sqlite.exec('UPDATE operations_alert_monitor SET lease_until=0');
 const next=alerts.evaluateOperationsAlerts({DB:d.DB},async()=>{enteredNew();await newGate;return signals('retry');},start+300000);await newReady;
 releaseOld();assert.equal((await old).status,'skipped');
 const third=await alerts.evaluateOperationsAlerts({DB:d.DB},async()=>{throw Error('must stay leased');},start+600000);assert.equal(third.status,'skipped');
 releaseNew();await next;assert.equal((await d.read()).checkedAt,new Date(start+300000).toISOString());
});

test('lease expiration during batch rolls back every event, state and success heartbeat',async()=>{
 const d=setup();await d.run(0);
 d.sqlite.exec('CREATE TRIGGER expire_alert AFTER INSERT ON operations_alert_events BEGIN UPDATE operations_alert_monitor SET lease_until=0; END');
 assert.equal((await d.run(900)).status,'skipped');const result=await d.read();assert.equal(result.active.length,0);assert.equal(result.events.length,0);assert.equal(result.checkedAt,new Date(start).toISOString());
});

test('own lease timeout breaks recovery confirmation until two fresh healthy observations',async()=>{
 const d=setup();await d.run(0);await d.run(900);await d.run(1200,'healthy');
 const expired=await alerts.evaluateOperationsAlerts({DB:d.DB},async()=>{d.sqlite.exec('UPDATE operations_alert_monitor SET lease_until=0');return signals('healthy');},start+1400000);
 assert.equal(expired.status,'skipped');await d.run(1500,'healthy');assert.equal((await d.read()).active.length,1);
 await d.run(1800,'healthy');assert.equal((await d.read()).active.length,0);
});

test('Instagram pending overdue remains bad while a running lease hides display overdue',async()=>{
 const d=setup(),value=signals();value.instagram={status:'running',pendingErrors:0,overdue:0,pendingOverdue:1};
 await d.run(0,value);await d.run(900,value);assert.deepEqual((await d.read()).active.map(a=>a.key),['instagram']);
 await d.run(1200,value);assert.deepEqual((await d.read()).events.map(e=>e.type),['problem']);
});

test('read errors retain active alerts and success heartbeat; failed transaction rolls back state and events',async()=>{
 const d=setup();await d.run(0);await d.run(900);const checked=(await d.read()).checkedAt;
 for(let i=0;i<2;i++)await assert.rejects(alerts.evaluateOperationsAlerts({DB:d.DB},async()=>{throw Error('provider secret URL');},start+1200000));
 assert.equal((await d.read()).checkedAt,checked);assert.equal((await d.read()).active.length,1);
 await d.run(1200,'healthy');d.sqlite.exec("CREATE TRIGGER fail_alert BEFORE INSERT ON operations_alert_events BEGIN SELECT RAISE(ABORT,'fail'); END");
 await assert.rejects(d.run(1500,'healthy'));assert.equal((await d.read()).active.length,1);assert.equal((await d.read()).events.length,1);assert.equal((await d.read()).checkedAt,new Date(start+1200000).toISOString());
 d.sqlite.exec('DROP TRIGGER fail_alert');await d.run(1500,'healthy');await d.run(1800,'healthy');assert.equal((await d.read()).active.length,0);
});

test('failed evaluation breaks pending problem and recovery continuity without clearing active state',async()=>{
 const d=setup();await d.run(0);await d.run(600);
 await assert.rejects(alerts.evaluateOperationsAlerts({DB:d.DB},async()=>{throw Error('read failure');},start+800000));
 await d.run(900);assert.equal((await d.read()).active.length,0);await d.run(1800);assert.equal((await d.read()).active.length,1);
 await d.run(2100,'healthy');await assert.rejects(alerts.evaluateOperationsAlerts({DB:d.DB},async()=>{throw Error('read failure');},start+2200000));
 await d.run(2400,'healthy');assert.equal((await d.read()).active.length,1);await d.run(2700,'healthy');assert.equal((await d.read()).active.length,0);
});

test('daily history deadline and fresh failed/successful records drive persistent alerts',async()=>{
 const d=setup();d.sqlite.exec('DELETE FROM operations_history');const base=Date.parse('2026-09-15T15:05:00Z');
 const run=minutes=>alerts.evaluateOperationsAlerts({DB:d.DB},async()=>signals(),base+minutes*60000);
 await run(119);await run(120);await run(135);assert.deepEqual((await d.read()).active.map(a=>a.key),['history']);
 d.sqlite.exec("INSERT INTO operations_history(day,captured_at,x_total,instagram_total,manual_total,query_version,query_status) VALUES('2026-09-15','2026-09-15T00:00:00Z',0,0,0,'x-review-v1','ok')");await run(140);assert.equal((await d.read()).active.length,1);
 d.sqlite.exec("INSERT INTO operations_history(day,captured_at,x_total,instagram_total,manual_total,query_version,query_status) VALUES('2026-09-16','2026-09-15T17:00:00Z',0,0,0,'x-review-v1','failed')");await run(145);assert.equal((await d.read()).active.length,1);
 d.sqlite.exec("UPDATE operations_history SET query_status='ok' WHERE day='2026-09-16'");await run(150);await run(155);assert.equal((await d.read()).active.length,0);
});

test('history prior failures before deadline are unknown and cannot recover active alerts',async()=>{
 const d=setup();d.sqlite.exec("UPDATE operations_history SET query_status='failed'");await d.run(0,'healthy');await d.run(900,'healthy');
 const time=Date.parse('2026-09-15T16:00:00Z');await alerts.evaluateOperationsAlerts({DB:d.DB},async()=>signals(),time);await alerts.evaluateOperationsAlerts({DB:d.DB},async()=>signals(),time+300000);
 assert.equal((await d.read()).active[0].key,'history');assert.equal((await d.read()).events.length,1);
});

test('read model has safe labels only and bounds newest events by descending id',async()=>{
 const d=setup(),value=signals('retry');value.x.sources[0].error='secret https://private';value.x.sources.push({source:'evil https://private',status:'retry'});
 for(let i=0;i<6;i++){const offset=i*1800;await d.run(offset,value);await d.run(offset+900,value);await d.run(offset+1200,'healthy');await d.run(offset+1500,'healthy');}
 const result=await d.read();assert.equal(result.events.length,12);assert.ok(!JSON.stringify(result).includes('private'));
 for(let i=6;i<11;i++){const offset=i*1800;await d.run(offset,value);await d.run(offset+900,value);await d.run(offset+1200,'healthy');await d.run(offset+1500,'healthy');}
 const events=(await d.read()).events;assert.equal(events.length,20);assert.ok(events.every((e,i)=>!i||e.id<events[i-1].id));
});
