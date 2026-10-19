import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomInt, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
test('HTTP: registration, isolation, ownership, idempotency, offline events, restart and session revocation',{timeout:90000},async()=>{
 const dir=mkdtempSync(join(tmpdir(),'zwiequest-test-')),port=46000+Math.floor(Math.random()*10000),base=`http://127.0.0.1:${port}`;
 let child,output='';
 async function start(){child=spawn(process.execPath,['src/server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),DATA_DIR:dir},stdio:['ignore','pipe','pipe']});child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);for(let i=0;i<60;i++){try{if((await fetch(base+'/api/health')).ok)return;}catch{}await sleep(100);}throw Error(output);}
 async function stop(){const c=child;const ended=new Promise(r=>c.once('exit',r));c.kill('SIGTERM');await ended;child=null;}
 async function req(path,body,cookie='',extra={}){const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{Origin:base,'Content-Type':'application/json',Cookie:cookie,...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 try{
  await start();const password=String(randomInt(1_000_000)).padStart(6,'0');
  const icon=await fetch(base+'/assets/ui-icons/damage-fire.svg');
  assert.equal(icon.status,200);assert.equal(icon.headers.get('content-type'),'image/svg+xml');assert.match(await icon.text(),/<path /);
  assert.equal((await req('/api/state')).status,401);
  const a=await req('/api/auth/register',{username:'test_alpha',password}),b=await req('/api/auth/register',{username:'test_beta',password});assert.equal(a.status,200);assert.equal(b.status,200);
  assert.equal((await req('/api/auth/login',{username:'test_alpha',password:'wrongpassword'})).status,400);
  assert.equal((await req('/api/command',{type:'CREATE',classId:'warrior',requestId:randomUUID()},a.cookie,{Origin:'https://attacker.example'})).status,403);
  const create=await req('/api/command',{type:'CREATE',classId:'warrior',requestId:randomUUID()},a.cookie);assert.equal(create.body.state.classId,'warrior');assert.equal((await req('/api/state',undefined,b.cookie)).body.state,null);
  const beta=await req('/api/command',{type:'CREATE',classId:'wizard',requestId:randomUUID()},b.cookie);assert.equal(beta.body.state.classId,'wizard');
  const appearanceCommand={type:'APPEARANCE',appearanceId:'cat',requestId:randomUUID()};
  const appearance=await req('/api/command',appearanceCommand,a.cookie);
  assert.equal(appearance.status,200);assert.equal(appearance.body.state.appearanceId,'cat');assert.equal(appearance.body.state.classId,'warrior');
  assert.ok(appearance.body.state.remaining<=create.body.state.remaining);
  assert.equal((await req('/api/command',appearanceCommand,a.cookie)).body.duplicate,true);
  assert.equal((await req('/api/state',undefined,b.cookie)).body.state.appearanceId,'wizard');
  const armor=create.body.state.equipment.armor;
  const wizard=await req('/api/command',{type:'CLASS',classId:'wizard',requestId:randomUUID()},a.cookie);
  assert.equal(wizard.status,200);assert.equal(wizard.body.state.level,1);assert.equal(wizard.body.state.xp,0);assert.deepEqual(wizard.body.state.equipment,{});
  assert.equal((await req('/api/command',{type:'UNEQUIP',itemId:create.body.state.skillSlots[0],requestId:randomUUID()},a.cookie)).status,200);
  assert.equal((await req('/api/command',{type:'EQUIP',itemId:armor,requestId:randomUUID()},a.cookie)).status,200);
  const restored=await req('/api/command',{type:'APPEARANCE',appearanceId:'cat',requestId:randomUUID()},a.cookie);
  assert.deepEqual(restored.body.state.equipment,create.body.state.equipment);assert.ok(restored.body.state.skillSlots.every(id=>id===null));
  assert.deepEqual(restored.body.state.equipmentUsers[armor].sort(),['warrior','wizard']);
  const item=create.body.state.inventory.find(i=>i.slot==='weapon');
  assert.equal((await req('/api/command',{type:'UNEQUIP',itemId:item.id,requestId:randomUUID()},a.cookie)).status,200);
  assert.equal((await req('/api/command',{type:'SELL',itemId:item.id,requestId:randomUUID()},b.cookie)).status,409);
  const sale={type:'SELL',itemId:item.id,requestId:randomUUID()};const sold=await req('/api/command',sale,a.cookie),dup=await req('/api/command',sale,a.cookie);assert.equal(sold.body.state.gold,item.value);assert.equal(dup.body.state.gold,item.value);assert.equal(dup.body.duplicate,true);
  const second=await req('/api/auth/login',{username:'test_alpha',password});assert.equal((await req('/api/state',undefined,second.cookie)).body.state.inventory.length,create.body.state.inventory.length-1);
  await req('/api/presence',{clientId:'tab-a',active:true},a.cookie);await req('/api/presence',{clientId:'tab-b',active:true},second.cookie);await req('/api/presence',{clientId:'tab-a',active:false},a.cookie);assert.equal((await req('/api/state',undefined,second.cookie)).body.mode,'ONLINE');
  const ghost = await fetch(base+'/api/events?clientId=tab-b',{headers:{Cookie:second.cookie}}); const reader=ghost.body.getReader(); await reader.read(); await sleep(12800); assert.equal((await req('/api/state',undefined,second.cookie)).body.mode,'OFFLINE','SSE socket without fresh heartbeat must not remain online'); await reader.cancel();
  await req('/api/auth/logout',{},a.cookie);await req('/api/auth/logout',{},second.cookie);assert.equal((await req('/api/state',undefined,a.cookie)).status,401);
  const db=new DatabaseSync(join(dir,'zwiequest.sqlite'));const initial=db.prepare('SELECT MAX(seq) AS seq FROM user_events WHERE user_id=?').get(a.body.user.id).seq;
  await sleep(21000);const after=db.prepare('SELECT MAX(seq) AS seq FROM user_events WHERE user_id=?').get(a.body.user.id).seq;assert.ok(after>initial,'events accumulated in DB without login');
  await stop();const state=JSON.parse(db.prepare('SELECT body FROM account_state WHERE user_id=?').get(a.body.user.id).body);const count=db.prepare('SELECT COUNT(*) n FROM user_events WHERE user_id=?').get(a.body.user.id).n;await sleep(1800);assert.equal(db.prepare('SELECT COUNT(*) n FROM user_events WHERE user_id=?').get(a.body.user.id).n,count);db.close();
  await start();const login=await req('/api/auth/login',{username:'test_alpha',password});const resumed=(await req('/api/state',undefined,login.cookie)).body.state;assert.equal(resumed.eventSeq,state.eventSeq);assert.ok(resumed.remaining>state.remaining-1200,'stopped time not replayed');assert.equal(resumed.gold,state.gold);assert.equal(resumed.appearanceId,'cat');
  assert.ok(resumed.skillSlots.every(id=>id===null));assert.equal(resumed.classProfiles.wizard.equipment.armor,armor);assert.equal(resumed.classProfiles.wizard.level,1);
  const check=new DatabaseSync(join(dir,'zwiequest.sqlite'));const u=check.prepare('SELECT * FROM users WHERE id=?').get(a.body.user.id);assert.notEqual(u.password_hash,password);assert.equal(u.password_hash.length,128);assert.equal(check.prepare('SELECT COUNT(*) n FROM account_state').get().n,2);check.close();
 }finally{if(child)await stop();rmSync(dir,{recursive:true,force:true});}
});
