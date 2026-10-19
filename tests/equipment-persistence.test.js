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
import { generateEquipment } from '../src/equipment.js';
import { generateLegacyMap } from './fixtures/maps-v1.js';

test('HTTP reload migrates old tactics/armor, preserves in-flight AP and saved gear, and persists equip/sell', { timeout: 20000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'zwiequest-equipment-'));
  const port = 35000 + Math.floor(Math.random() * 9000), origin = `http://127.0.0.1:${port}`;
  let child, output = '', cookie;
  const stop = async () => { if (!child) return; const c = child; child = null; const exited = new Promise(resolve => c.once('exit', resolve)); c.kill('SIGTERM'); await exited; };
  const start = async () => {
    child = spawn(process.execPath, ['src/server.js'], { cwd: new URL('..', import.meta.url), env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), PUBLIC_ORIGIN: origin, DATA_DIR: dir }, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', d => output += d); child.stderr.on('data', d => output += d);
    for (let n = 0; n < 70; n++) { try { if ((await fetch(origin + '/api/health')).ok) return; } catch {} await new Promise(r => setTimeout(r, 60)); }
    throw Error(output);
  };
  const request = async (path, body) => {
    const response = await fetch(origin + path, { method: body ? 'POST' : 'GET', headers: { Origin: origin, Cookie: cookie || '', 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    cookie = response.headers.get('set-cookie')?.split(';')[0] || cookie;
    const data = await response.json(); assert.equal(response.status, 200, JSON.stringify(data)); return data;
  };
  try {
    // Initialize the schema with the real server, then seed only this isolated test DB.
    await start(); await stop();
    const db = new DatabaseSync(join(dir, 'zwiequest.sqlite'));
    const auth = new LocalAuth(db, false), user = await auth.register('equipment_test', '123456');
    const config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url)));
    const game = new Game(config); game.create({name: '모험가', appearanceId: 'warrior'});game.state.homePaused=false; game.state.remaining = game.state.duration = 600000;
    game.state.maps=Object.fromEntries(Object.keys(game.state.maps).map(id=>[id,generateLegacyMap(id,()=>0)]));
    const legacy = { id: 'legacy-fixture', slot: 'weapon', classId: 'warrior', name: '여행자의 검', icon: 'sword', tier: 2, rarity: '희귀', value: 40, stats: { power: 6, PEN: 5 } };
    const charm = generateEquipment({slot:'charm',templateId:'wisdom-charm',gradeId:'legendary',rng:()=>2});
    const oldCharm = {id:'old-charm',slot:'charm',name:'새벽의 부적',tier:1,rarity:'고급',icon:'charm',stats:{ACC:2,WIL:1},value:26};
    const special = generateEquipment({ slot: 'armor', classId: 'warrior', templateId: 'leather', gradeId: 'legendary', rng: () => 0 });
    game.state.inventory.push(legacy, special, charm, oldCharm); game.character.equipment.charm=oldCharm.id; game.character.equipment.weapon = legacy.id;
    game.state.risk = 0; game.beginBattle(); game.state.remaining = game.state.duration = 600000;
    game.state.tactic = 'pierce'; delete game.state.combatRulesVersion; delete game.state.battle.rulesVersion;
    game.state.battle.ap = 2; game.state.battle.attacks = 1;
    const savedActor = game.state.battle.actor;
    const oldArmor = game.state.inventory.find(i => i.id === special.id);
    delete oldArmor.stats.DEX; delete oldArmor.dexRulesVersion;
    const expectedArmor = { ...structuredClone(oldArmor), stats: { ...oldArmor.stats, DEX: -1 }, dexRulesVersion: 2 };
    // Existing inventories still contain the former PNG URLs.
    for (const item of game.state.inventory) if (item.iconPath) item.iconPath=item.iconPath.replace(/\.webp$/, '.png');
    db.prepare('INSERT INTO account_state VALUES(?,?)').run(user.id, JSON.stringify(game.state)); db.close();
    await start(); await request('/api/auth/login', { username: 'equipment_test', password: '123456' });
    let state = (await request('/api/state')).state;
    assert.equal(state.mapGraph.version,2);
    for (const item of state.inventory.filter(i => i.slot !== 'skill')) {
      assert.match(item.iconPath,/\.webp$/);
      const image=await fetch(origin+item.iconPath);assert.equal(image.status,200);assert.match(image.headers.get('content-type'),/image\/webp/);
    }
    assert.equal(state.tactic, undefined); assert.equal(state.battle.ap, 2); assert.equal(state.battle.attacks, 1); assert.equal(state.battle.actor, savedActor);
    const converted = state.inventory.find(i => i.id === legacy.id);assert.equal(converted.templateId,'longsword');assert.equal(converted.gradeId,'excellent');assert.equal(converted.stats.power,undefined);
    const convertedCharm=state.inventory.find(i=>i.id===oldCharm.id);assert.equal(convertedCharm.gradeId,'fine');assert.equal(convertedCharm.accessoryRulesVersion,1);assert.equal(convertedCharm.stats.ACC,undefined);assert.equal(state.equipment.charm,oldCharm.id);
    await request('/api/command',{type:'EQUIP',characterId:game.character.id,itemId:charm.id,requestId:randomUUID()});
    assert.deepEqual(state.inventory.find(i => i.id === special.id), expectedArmor);
    await request('/api/command', { type: 'EQUIP', characterId:game.character.id, itemId: special.id, requestId: randomUUID() });
    await request('/api/command', { type: 'UNEQUIP', characterId:game.character.id, itemId: legacy.id, requestId: randomUUID() });
    await request('/api/command', { type: 'SELL', itemId: legacy.id, requestId: randomUUID() });
    await stop(); await start();
    state = (await request('/api/state')).state;
    assert.equal(state.mapGraph.version,2);
    assert.equal(state.equipment.charm,charm.id);assert.deepEqual(state.inventory.find(i=>i.id===charm.id),{...charm,iconPath:charm.iconPath.replace(/\.png$/,'.webp')});assert.deepEqual(state.inventory.find(i=>i.id===oldCharm.id),convertedCharm);
    assert.equal(state.equipment.armor, special.id); assert.equal(state.gold, 40);
    assert.deepEqual(state.inventory.find(i => i.id === special.id), expectedArmor);
    assert.equal(state.inventory.some(i => i.id === legacy.id), false);
    assert.equal(state.battle.ap, 2); assert.equal(state.battle.actor, savedActor);
    assert.equal(state.stats.AR, special.stats.AR); assert.deepEqual(state.stats.typeModifiers, special.typeModifiers);
  } finally { await stop(); rmSync(dir, { recursive: true, force: true }); }
});
