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
test('HTTP skill authority: duplicate request, concurrent tabs, reload/restart, durable cooldown/2-use limit, legacy migration and new battle reset', {timeout:20000}, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'zwiequest-skills-http-')), port = 38000 + Math.floor(Math.random() * 5000), base = `http://127.0.0.1:${port}`;
  let child, output = '', db;
  async function start() {
    child = spawn(process.execPath, ['src/server.js'], { cwd: new URL('..', import.meta.url), env: {...process.env, PORT: String(port), PUBLIC_ORIGIN: base, DATA_DIR: dir}, stdio: ['ignore','pipe','pipe'] });
    child.stdout.on('data', d => output += d); child.stderr.on('data', d => output += d);
    for (let n=0; n<60; n++) { try { if ((await fetch(base + '/api/health')).ok) return; } catch {} await new Promise(r => setTimeout(r, 50)); } throw Error(output);
  }
  async function stop() { if (!child) return; const c = child; child = null; const done = new Promise(r => c.once('exit',r)); c.kill('SIGTERM'); await done; }
  async function req(path, body, cookie='') {
    const r = await fetch(base+path, { method: body ? 'POST':'GET', headers: {Origin:base, Cookie:cookie, 'Content-Type':'application/json'}, ...(body ? {body:JSON.stringify(body)}:{}) });
    return {status:r.status, body:await r.json(), cookie:r.headers.get('set-cookie')?.split(';')[0]};
  }
  try {
    await start(); await stop(); db = new DatabaseSync(join(dir, 'zwiequest.sqlite'));
    const auth = new LocalAuth(db), user = await auth.register('skills_fixture','123456');
    const c = JSON.parse(readFileSync(new URL('../config.json', import.meta.url))), g = new Game(c); g.create({name: '모험가', appearanceId: 'wizard'});g.state.homePaused=false; g.state.risk = 0; g.beginBattle(); g.state.battle.transition = {actor:'hero',remainingMs:600000,durationMs:600000}; g.character.hp = 1; g.state.remaining = g.state.duration = 600000;
    db.prepare('INSERT INTO account_state VALUES(?,?)').run(user.id, JSON.stringify(g.state));
    for (const event of g.events) db.prepare('INSERT INTO user_events VALUES(?,?,?,?)').run(user.id,event.seq,event.at,JSON.stringify(event));
    await start();
    const a = await req('/api/auth/login', {username:user.username,password:'123456'}), b = await req('/api/auth/login', {username:user.username,password:'123456'});
    const send = fields => ({type:'USE_SKILL', characterId:g.character.id, progressId:g.state.progressId, battleId:g.state.battle.id, heroActionSeq:g.state.battle.combatants.hero.actionSeq, itemId:g.character.skillSlots[0], requestId:randomUUID(), ...fields});
    const command = send(), used = await req('/api/command', command, a.cookie); assert.equal(used.status,200); assert.ok(used.body.state.hp > 1); assert.equal(used.body.state.battle.combatants.hero.actionSeq,0); assert.equal(used.body.state.battle.skillUseCounts.heal,1);
    const duplicate = await req('/api/command', command, a.cookie); assert.equal(duplicate.body.duplicate,true); assert.equal(duplicate.body.state.hp,used.body.state.hp); assert.equal(duplicate.body.state.battle.skillUseCounts.heal,1);
    assert.equal((await req('/api/command',send(),b.cookie)).status,409);
    const equip = type => req('/api/command',{type,characterId:g.character.id,itemId:command.itemId,progressId:g.state.progressId,requestId:randomUUID()},a.cookie);
    assert.equal((await equip('UNEQUIP')).status,200); assert.equal((await equip('EQUIP')).status,200); assert.equal((await req('/api/command',send(),a.cookie)).status,409);
    const cooldown = used.body.state.skillCooldowns; await stop(); await start();
    const loaded = (await req('/api/state',undefined,a.cookie)).body.state; assert.deepEqual(loaded.skillCooldowns,cooldown); assert.equal(loaded.battle.skillUseCounts.heal,1); assert.equal(loaded.battle.skillUsed,true); assert.equal(loaded.hp,used.body.state.hp);
    assert.equal((await req('/api/command',send(),a.cookie)).status,409);
    await stop(); const saved = JSON.parse(db.prepare('SELECT body FROM account_state WHERE user_id=?').get(user.id).body);
    saved.battle.combatants.hero.actionSeq++; saved.battle.skillUsed = false; db.prepare('UPDATE account_state SET body=? WHERE user_id=?').run(JSON.stringify(saved),user.id); await start();
    const waiting = await req('/api/command',send({heroActionSeq:saved.battle.combatants.hero.actionSeq}),a.cookie); assert.equal(waiting.status,409); assert.match(waiting.body.error,/대기/);
    assert.equal((await req('/api/command',send(),a.cookie)).status,409);
    await stop(); saved.characters[0].skillCooldowns.heal.readyAt = Date.now()-1; db.prepare('UPDATE account_state SET body=? WHERE user_id=?').run(JSON.stringify(saved),user.id); await start();
    const second = await req('/api/command',send({heroActionSeq:saved.battle.combatants.hero.actionSeq}),a.cookie); assert.equal(second.status,200); assert.equal(second.body.state.battle.skillUseCounts.heal,2);
    await stop();
    const afterSecond=JSON.parse(db.prepare('SELECT body FROM account_state WHERE user_id=?').get(user.id).body);
    afterSecond.battle.combatants.hero.actionSeq++;afterSecond.battle.skillUsed=false;afterSecond.characters[0].skillCooldowns.heal.readyAt=Date.now()-1;
    db.prepare('UPDATE account_state SET body=? WHERE user_id=?').run(JSON.stringify(afterSecond),user.id);await start();
    const exhausted=await req('/api/command',send({heroActionSeq:afterSecond.battle.combatants.hero.actionSeq}),a.cookie);assert.equal(exhausted.status,409);assert.match(exhausted.body.error,/소진/);assert.equal(exhausted.body.state.battle.skillUseCounts.heal,2);
    await stop();
    // Simulate upgrading a pre-counter save: retained accepted skill logs restore 2 uses.
    delete afterSecond.battle.skillUseCounts;
    db.prepare('UPDATE account_state SET body=? WHERE user_id=?').run(JSON.stringify(afterSecond),user.id);await start();
    const migrated=(await req('/api/state',undefined,a.cookie)).body.state;assert.equal(migrated.battle.skillUseCounts.heal,2);
    assert.equal((await req('/api/command',send({heroActionSeq:migrated.battle.combatants.hero.actionSeq}),a.cookie)).status,409);await stop();
    const next=new Game(c,JSON.parse(db.prepare('SELECT body FROM account_state WHERE user_id=?').get(user.id).body));next.beginBattle();next.state.battle.transition={actor:'hero',remainingMs:600000,durationMs:600000};next.state.remaining=600000;next.character.hp=1;next.character.skillCooldowns.heal.readyAt=Date.now()-1;
    db.prepare('UPDATE account_state SET body=? WHERE user_id=?').run(JSON.stringify(next.state),user.id);await start();
    const reset=await req('/api/command',send({battleId:next.state.battle.id,heroActionSeq:next.state.battle.combatants.hero.actionSeq}),a.cookie);assert.equal(reset.status,200);assert.equal(reset.body.state.battle.skillUseCounts.heal,1);
  } finally { await stop(); db?.close(); rmSync(dir,{recursive:true,force:true}); }
});
