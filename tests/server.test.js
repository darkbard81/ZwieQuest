import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
test('HTTP character ownership, duplicate/multitab allocation, cap/retirement, restart and unattended progression',{timeout:70000},async()=>{
 const dir=mkdtempSync(join(tmpdir(),'zwiequest-characters-http-')),port=46000+Math.floor(Math.random()*10000),base=`http://127.0.0.1:${port}`;
 let child,output='';
 async function start(){child=spawn(process.execPath,['src/server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),PUBLIC_ORIGIN:base,DATA_DIR:dir},stdio:['ignore','pipe','pipe']});child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);for(let i=0;i<60;i++){try{if((await fetch(base+'/api/health')).ok)return;}catch{}await sleep(100);}throw Error(output);}
 async function stop(){if(!child)return;const c=child;child=null;if(c.exitCode!==null)return;const ended=new Promise(r=>c.once('exit',r));c.kill('SIGTERM');await ended;}
 async function req(path,body,cookie='',extra={}){const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{Origin:base,'Content-Type':'application/json',Cookie:cookie,...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 const send=(cookie,type,fields={})=>req('/api/command',{type,requestId:randomUUID(),...fields},cookie);
 try{
  await start();assert.equal((await req('/api/state')).status,401);
  const a=await req('/api/auth/register',{username:'character_alpha',password:'123456'}),b=await req('/api/auth/register',{username:'character_beta',password:'123456'});
  assert.equal(a.status,200);assert.equal(b.status,200);const second=await req('/api/auth/login',{username:'character_alpha',password:'123456'});
  assert.equal((await req('/api/state',undefined,a.cookie)).body.state.characters.length,0);
  assert.equal((await req('/api/command',{type:'CREATE_CHARACTER',name:'차단',appearanceId:'cat',requestId:randomUUID()},a.cookie,{Origin:'https://attacker.example'})).status,403);
  const creation={type:'CREATE_CHARACTER',name:'별빛',appearanceId:'cat',requestId:randomUUID()};const created=await req('/api/command',creation,a.cookie);assert.equal(created.status,200);const id=created.body.state.activeCharacterId;
  assert.equal((await req('/api/command',creation,second.cookie)).body.duplicate,true);assert.equal((await req('/api/state',undefined,a.cookie)).body.state.characters.length,1);
  const foreign=await send(b.cookie,'CREATE_CHARACTER',{name:'다른 계정',appearanceId:'wizard'});assert.equal(foreign.status,200);assert.equal((await send(b.cookie,'SELECT_CHARACTER',{characterId:id})).status,409);
  const points={type:'ALLOCATE_STAT',characterId:id,stat:'CON',amount:999,requestId:randomUUID()};const results=await Promise.all([req('/api/command',points,a.cookie),req('/api/command',points,second.cookie)]);assert.ok(results.every(r=>r.status===200));assert.ok(results.some(r=>r.body.duplicate));
  let state=(await req('/api/state',undefined,a.cookie)).body.state;assert.equal(state.attributes.CON,1);assert.equal(state.attributePoints,9);
  const weapon=state.equipment.weapon;
  const c2=await send(a.cookie,'CREATE_CHARACTER',{name:'새벽',appearanceId:'cat'});assert.equal(c2.status,200);const id2=c2.body.state.characters[1].id;
  assert.equal((await send(a.cookie,'SELECT_CHARACTER',{characterId:id2})).status,200);
  assert.equal((await send(second.cookie,'ALLOCATE_STAT',{characterId:id,stat:'STR'})).status,409);
  assert.equal((await send(a.cookie,'EQUIP',{characterId:id2,itemId:weapon})).status,409);
  assert.equal((await send(a.cookie,'EQUIP',{characterId:id2,itemId:created.body.state.skillSlots[0]})).status,200);
  await sleep(1100);
  assert.equal((await send(a.cookie,'CREATE_CHARACTER',{name:'셋째',appearanceId:'lamia'})).status,200);assert.equal((await send(a.cookie,'CREATE_CHARACTER',{name:'넷째',appearanceId:'ranger'})).status,409);
  assert.equal((await send(a.cookie,'SELECT_CHARACTER',{characterId:id})).status,200);
  const before=(await req('/api/state',undefined,a.cookie)).body.state;
  assert.equal((await send(a.cookie,'RETIRE_CHARACTER',{characterId:id2,confirmName:'새벽'})).status,200);
  state=(await req('/api/state',undefined,a.cookie)).body.state;assert.equal(state.characters.length,2);assert.deepEqual(state.inventory,before.inventory);assert.equal(state.attributePoints,9);assert.equal(state.hp,50);
  // Race the last available point from two tabs. Exactly one succeeds.
  for(let n=0;n<8;n++)assert.equal((await send(a.cookie,'ALLOCATE_STAT',{characterId:id,stat:'PER'})).status,200);
  await sleep(1100);const race=await Promise.all([send(a.cookie,'ALLOCATE_STAT',{characterId:id,stat:'PER'}),send(second.cookie,'ALLOCATE_STAT',{characterId:id,stat:'PER'})]);assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);
  state=(await req('/api/state',undefined,a.cookie)).body.state;assert.equal(state.attributePoints,0);assert.equal(state.attributes.PER,9);
  await stop();await start();state=(await req('/api/state',undefined,a.cookie)).body.state;assert.equal(state.attributePoints,0);assert.equal(state.attributes.PER,9);assert.equal(state.homePaused,true);assert.equal(state.characters.length,2);
  assert.equal((await send(a.cookie,'DEPART',{characterId:id})).status,200);assert.equal((await send(a.cookie,'RETIRE_CHARACTER',{characterId:id,confirmName:'별빛'})).status,409);assert.equal((await send(a.cookie,'CREATE_CHARACTER',{name:'길 위',appearanceId:'cat'})).status,409);
  await req('/api/presence',{clientId:'tab-a',active:true},a.cookie);await req('/api/presence',{clientId:'tab-b',active:true},second.cookie);await req('/api/presence',{clientId:'tab-a',active:false},a.cookie);assert.equal((await req('/api/state',undefined,second.cookie)).body.mode,'ONLINE');
  await req('/api/auth/logout',{},a.cookie);await req('/api/auth/logout',{},second.cookie);assert.equal((await req('/api/state',undefined,a.cookie)).status,401);
  const db=new DatabaseSync(join(dir,'zwiequest.sqlite'));const seq=db.prepare('SELECT MAX(seq) seq FROM user_events WHERE user_id=?').get(a.body.user.id).seq;await sleep(14000);assert.ok(db.prepare('SELECT MAX(seq) seq FROM user_events WHERE user_id=?').get(a.body.user.id).seq>seq);
  await stop();const saved=JSON.parse(db.prepare('SELECT body FROM account_state WHERE user_id=?').get(a.body.user.id).body);const savedAt=Date.now();await sleep(1200);await start();const login=await req('/api/auth/login',{username:'character_alpha',password:'123456'});state=(await req('/api/state',undefined,login.cookie)).body.state;assert.equal(state.activeCharacterId,id);assert.equal(state.attributes.PER,9);assert.ok(state.remaining>saved.remaining-1000);assert.equal(state.characters[1].xp,saved.characters[1].xp);assert.equal(state.classId,undefined);db.close();
 }finally{await stop();rmSync(dir,{recursive:true,force:true});}
});
