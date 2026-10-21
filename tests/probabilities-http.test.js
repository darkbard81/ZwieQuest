import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {DROP_WEIGHTS} from '../src/probabilities.js';
import {LocalAuth} from '../src/auth.js';
test('HTTP probability settings require admin, update all accounts, survive restart and reject conflicts', {timeout:20000},async()=>{
 const dir=mkdtempSync(join(tmpdir(),'zwiequest-probabilities-')),port=47000+Math.floor(Math.random()*4000),base=`http://127.0.0.1:${port}`;
 let child,output='',db;
 async function start(){child=spawn(process.execPath,['src/server.js'],{env:{...process.env,PORT:String(port),PUBLIC_ORIGIN:base,DATA_DIR:dir},stdio:['ignore','pipe','pipe']});child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);for(let i=0;i<80;i++){try{if((await fetch(base+'/api/health')).ok)return;}catch{}await new Promise(r=>setTimeout(r,60));}throw Error(output);}
 async function stop(){if(!child)return;const c=child;child=null;const done=new Promise(r=>c.once('exit',r));c.kill('SIGTERM');await done;}
 async function req(path,body,cookie='',origin=base){const res=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:res.status,body:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]};}
 const path='/api/admin/probabilities';
 try{
  await start();await stop();db=new DatabaseSync(join(dir,'zwiequest.sqlite'));const auth=new LocalAuth(db);
  const admin=await auth.register('prob_admin','123456'),player=await auth.register('prob_player','123456');db.prepare('INSERT INTO admin_accounts VALUES(?)').run(admin.id);
  await start();const a=await req('/api/auth/login',{username:admin.username,password:'123456'}),p=await req('/api/auth/login',{username:player.username,password:'123456'});
  assert.equal((await req(path)).status,401);assert.equal((await req(path,undefined,p.cookie)).status,403);
  const original=(await req(path,undefined,a.cookie)).body;assert.equal(original.revision,0);
  const update={revision:0,requestId:randomUUID(),probabilities:{...DROP_WEIGHTS,battlePercent:100,treasurePercent:0,passPercent:0,dropPercent:100}};
  assert.equal((await req(path,update,p.cookie)).status,403);assert.equal((await req(path,update,a.cookie,'https://other.example')).status,403);
  assert.equal((await req(path,{...update,probabilities:{...update.probabilities,passPercent:1}},a.cookie)).status,400);
  assert.equal((await req(path,undefined,a.cookie)).body.revision,0);
  await req('/api/state',undefined,p.cookie); // Existing account/game shares the live settings.
  const first=await req(path,update,a.cookie);assert.equal(first.status,200);assert.equal(first.body.revision,1);
  assert.deepEqual((await req('/api/state',undefined,p.cookie)).body.config.probabilities,update.probabilities);
  assert.equal((await req(path,update,a.cookie)).body.duplicate,true);
  assert.equal((await req(path,{...update,requestId:randomUUID()},a.cookie)).status,409);
  const second={revision:1,requestId:randomUUID(),probabilities:{...DROP_WEIGHTS,battlePercent:0,treasurePercent:100,passPercent:0,dropPercent:0}};
  db.exec("CREATE TRIGGER reject_probability BEFORE UPDATE ON probability_settings BEGIN SELECT RAISE(ABORT,'probability failure'); END;");
  assert.equal((await req(path,second,a.cookie)).status,500);assert.deepEqual((await req('/api/state',undefined,p.cookie)).body.config.probabilities,update.probabilities);
  db.exec('DROP TRIGGER reject_probability');assert.equal((await req(path,second,a.cookie)).status,200);
  const retried=await req(path,update,a.cookie);assert.equal(retried.body.duplicate,true);assert.deepEqual(retried.body.probabilities,second.probabilities);
  await stop();await start();assert.equal((await req(path,undefined,a.cookie)).body.revision,2);assert.deepEqual((await req('/api/state',undefined,p.cookie)).body.config.probabilities,second.probabilities);
  const concurrent=await Promise.all([req(path,{...update,revision:2,requestId:randomUUID()},a.cookie),req(path,{...second,revision:2,requestId:randomUUID()},a.cookie)]);assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);
 }finally{await stop();db?.close();rmSync(dir,{recursive:true,force:true});}
});
