import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { LocalAuth } from '../src/auth.js';
import { Game } from '../src/game.js';

test('HTTP admin provisioning, reset authorization/rollback/retry, stale commands, reveal and restart', {timeout:20000}, async()=>{
 const dir=mkdtempSync(join(tmpdir(),'zwiequest-admin-progress-')),port=37000+Math.floor(Math.random()*6000),base=`http://127.0.0.1:${port}`;
 let child,output='',db;
 async function start(){child=spawn(process.execPath,['src/server.js'],{env:{...process.env,PORT:String(port),PUBLIC_ORIGIN:base,DATA_DIR:dir},stdio:['ignore','pipe','pipe']});child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);for(let i=0;i<80;i++){try{if((await fetch(base+'/api/health')).ok)return;}catch{}await new Promise(r=>setTimeout(r,60));}throw Error(output);}
 async function stop(){if(!child)return;const c=child;child=null;const done=new Promise(r=>c.once('exit',r));c.kill('SIGTERM');await done;}
 async function req(path,body,cookie='',origin=base){const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 const command=(cookie,state,type,extra={})=>req('/api/command',{type,progressId:state.progressId,requestId:randomUUID(),...extra},cookie);
 try{
  await start();await stop();db=new DatabaseSync(join(dir,'zwiequest.sqlite'));
  const auth=new LocalAuth(db),admin=await auth.register('progress_admin','123456'),player=await auth.register('progress_player','123456'),other=await auth.register('progress_other','123456');
  db.prepare('INSERT INTO admin_accounts VALUES(?)').run(admin.id);
  const config=JSON.parse(readFileSync(new URL('../config.json',import.meta.url))),g=new Game(config);g.create('wizard');g.state.level=20;g.state.gold=500;g.state.xp=70;g.state.inactiveClasses.warrior={level:12,xp:9,equipment:{},tactic:'normal'};g.advance();g.choose('left');g.beginBattle();g.state.remaining=g.state.duration=600000;
  db.prepare('INSERT INTO account_state VALUES(?,?)').run(player.id,JSON.stringify(g.state));
  db.prepare('INSERT INTO user_events VALUES(?,?,?,?)').run(player.id,1,Date.now(),JSON.stringify({seq:1,type:'old',text:'OLD HISTORY'}));
  db.prepare('INSERT INTO requests VALUES(?,?,?)').run(player.id,'old-command',JSON.stringify({ok:true}));
  await start();
  const a=await req('/api/auth/login',{username:admin.username,password:'123456'}),p=await req('/api/auth/login',{username:player.username,password:'123456'}),o=await req('/api/auth/login',{username:other.username,password:'123456'});
  let state=(await req('/api/state',undefined,a.cookie)).body.state;
  assert.equal(state.classId,'warrior');assert.equal(state.inventory.length,2);assert.equal(state.checkpointHistory.length,4);assert.equal(state.exploredNodes.village.length,Object.keys(state.mapGraph.nodes).length);
  const normal=await req('/api/command',{type:'CREATE',classId:'warrior',isAdmin:true,requestId:randomUUID()},o.cookie);assert.equal(normal.status,200);assert.equal(normal.body.state.checkpointHistory.length,0);assert.equal(normal.body.state.exploredNodes.village.length,1);
  assert.equal((await command(o.cookie,normal.body.state,'ADMIN_REVEAL_MAP',{userId:admin.id})).status,403);
  const reset={userId:player.id,confirmUsername:player.username,requestId:randomUUID()};
  assert.equal((await req('/api/admin/reset-account',reset,p.cookie)).status,403);
  assert.equal((await req('/api/admin/reset-account',{...reset,confirmUsername:'wrong'},a.cookie)).status,409);
  assert.equal((await req('/api/admin/reset-account',reset,a.cookie,'https://other.example')).status,403);
  db.exec(`CREATE TRIGGER fail_reset BEFORE UPDATE ON account_state WHEN OLD.user_id='${player.id}' BEGIN SELECT RAISE(ABORT,'reset rollback fixture'); END;`);
  assert.equal((await req('/api/admin/reset-account',reset,a.cookie)).status,500);
  assert.equal((await req('/api/state',undefined,p.cookie)).body.state.gold,500);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM requests WHERE user_id=?').get(player.id).n,1);assert.equal(db.prepare('SELECT COUNT(*) n FROM account_resets').get().n,0);
  db.exec('DROP TRIGGER fail_reset');
  const result=await req('/api/admin/reset-account',reset,a.cookie);assert.equal(result.status,200);
  const fresh=(await req('/api/state',undefined,p.cookie)).body;assert.equal(fresh.state.level,1);assert.equal(fresh.state.gold,0);assert.equal(fresh.state.xp,0);assert.equal(fresh.state.phase,'HOME');assert.equal(fresh.state.classProfiles.warrior.level,1);assert.equal(fresh.state.inventory.length,2);assert.deepEqual(fresh.state.checkpointHistory,[]);assert.equal(fresh.state.exploredNodes.village.length,1);assert.notEqual(fresh.state.progressId,g.state.progressId);assert.ok(fresh.logs.every(e=>e.type!=='old'));
  assert.equal(db.prepare('SELECT COUNT(*) n FROM requests WHERE user_id=?').get(player.id).n,0);
  assert.equal((await command(p.cookie,g.state,'TACTIC',{tactic:'heal'})).status,409);
  assert.equal((await req('/api/command',{type:'TACTIC',tactic:'heal',requestId:randomUUID()},p.cookie)).status,409);
  assert.equal((await command(p.cookie,fresh.state,'TACTIC',{tactic:'heal'})).status,200);
  const retry=await req('/api/admin/reset-account',reset,a.cookie);assert.equal(retry.body.duplicate,true);const still=(await req('/api/state',undefined,p.cookie)).body.state;assert.equal(still.progressId,fresh.state.progressId);assert.equal(still.tactic,'heal');
  assert.equal((await req('/api/auth/me',undefined,p.cookie)).body.user.id,player.id);assert.equal((await req('/api/state',undefined,o.cookie)).body.state.progressId,normal.body.state.progressId);
  const self=await req('/api/admin/reset-account',{userId:admin.id,confirmUsername:admin.username,requestId:randomUUID()},a.cookie);assert.equal(self.status,200);assert.equal(self.body.state.gold,0);assert.deepEqual(self.body.state.checkpointHistory,[]);assert.equal(self.body.state.exploredNodes.village.length,1);
  await stop();await start();state=(await req('/api/state',undefined,a.cookie)).body.state;assert.deepEqual(state.checkpointHistory,[]);assert.equal(state.exploredNodes.village.length,1);assert.equal((await req('/api/auth/me',undefined,a.cookie)).body.user.isAdmin,true);
  const reveal={type:'ADMIN_REVEAL_MAP',progressId:state.progressId,requestId:randomUUID()};const shown=await req('/api/command',reveal,a.cookie);assert.equal(shown.status,200);assert.equal(shown.body.state.checkpointHistory.length,4);assert.equal(shown.body.state.exploredNodes.village.length,Object.keys(shown.body.state.mapGraph.nodes).length);assert.equal((await req('/api/command',reveal,a.cookie)).body.duplicate,true);
  await stop();await start();state=(await req('/api/state',undefined,a.cookie)).body.state;assert.equal(state.checkpointHistory.length,4);assert.equal(state.progressId,self.body.state.progressId);
 }finally{await stop();db?.close();rmSync(dir,{recursive:true,force:true});}
});
