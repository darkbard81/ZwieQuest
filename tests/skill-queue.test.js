import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../src/game.js';
import { stats } from '../src/combat.js';
import { generateEquipment } from '../src/equipment.js';
import { SKILL_CATALOG, useSkill } from '../src/skills.js';
import { skillAvailability } from '../public/skills-view.js';
const config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url)));
function make(dex = 0, budget = 500) {
  const c = structuredClone(config); c.actionSpeed.maxEventsPerTick = budget;
  const g = new Game(c, null, () => 0);
  g.create({ name: '예약 검증', appearanceId: 'wizard' });
  g.character.attributes.DEX = dex; g.state.risk = 0; g.beginBattle(); g.state.enemy.skills=[];
  Object.assign(g.state.enemy, { DEX: 0, hp: 100000, maxHp: 100000 });
  g.state.enemy.weapon.damageMin = g.state.enemy.weapon.damageMax = 0;
  g.character.hp = 1; g.events = []; g.refreshBattleTiming(); return g;
}
const cmd = g => ({ type: 'USE_SKILL', characterId: g.character.id, itemId: g.character.skillSlots[0], battleId: g.state.battle.id, heroActionSeq: g.state.battle.combatants.hero.actionSeq });
const heals = g => g.events.filter(e => e.type === 'skill');
const hits = g => g.events.filter(e => e.type === 'hit' && e.hit.actor === 'hero');
const cancelled = g => g.events.filter(e => e.type === 'skill-cancelled');

test('request reserves without costs; next DEX action heals once instead of rolling an attack', t => {
  let now = 1000; t.mock.method(Date, 'now', () => now);
  for (const dex of [0, 20]) {
    const g = make(dex), command = cmd(g), interval = stats(g.state, g.config).actionIntervalMs;
    g.tick(interval / 2); const before = structuredClone(g.state.battle.combatants);
    const remaining=g.state.remaining;
    g.command(command); assert.deepEqual(g.state.battle.combatants, before);assert.equal(g.state.remaining,remaining);
    assert.throws(() => g.command(command), /이미/);
    const alternate={...g.character.skills.find(i=>i.id===command.itemId),id:'second',templateId:'second-heal'};
    g.character.skills.push(alternate);g.character.skillSlots[1]=alternate.id;
    const catalog=structuredClone(SKILL_CATALOG);catalog.skills.push({...catalog.skills[0],id:alternate.templateId});
    assert.throws(()=>useSkill(g.state,alternate,stats(g.state,g.config),{...command,itemId:alternate.id},now,catalog),/이미/);
    for(const type of ['UNEQUIP','EQUIP'])g.command({type,characterId:g.character.id,itemId:command.itemId});
    assert.throws(()=>g.command(command),/이미/);
    assert.equal(g.character.hp, 1); assert.deepEqual(g.character.skillCooldowns, {}); assert.deepEqual(g.state.battle.skillUseCounts, {});
    let s = g.snapshot(), item = s.inventory.find(i => i.id === command.itemId);
    assert.equal(skillAvailability(s, item, now).kind, 'queued'); assert.equal(item.remainingUses, 2);
    assert.equal(skillAvailability(s, { ...item, id: 'another' }, now).ready, false);
    g.tick(interval / 2 - 1); assert.equal(heals(g).length, 0); assert.equal(g.character.hp, 1);
    now += 5000; const rolls = []; const rng = g.rng; g.rng = n => { rolls.push(n); return rng(n); };
    // Keep the enemy out of this boundary so RNG assertions cover only the hero.
    g.state.battle.combatants.enemy.readiness = 0;
    g.tick(1); assert.deepEqual(rolls, []); assert.equal(heals(g).length, 1); assert.equal(hits(g).length, 0);
    assert.equal(g.character.hp, 6); assert.equal(g.state.battle.pendingSkill, undefined);
    assert.equal(g.state.battle.combatants.hero.actionSeq, 1); assert.equal(g.state.battle.skillUseCounts.heal, 1);
    assert.equal(heals(g)[0].heroActionSeq, 1); assert.equal(heals(g)[0].combatTimeMs, interval);
    assert.deepEqual(g.character.skillCooldowns, {});
    assert.throws(() => g.command(command), /지났/);
    g.tick(interval); assert.equal(heals(g).length, 1); assert.equal(hits(g).length, 1);
  }
});

test('queued action retains progress through speed changes and computes effects from execution stats', () => {
  const g = make(); g.tick(1100); g.command(cmd(g));
  const plate = generateEquipment({ slot: 'armor', templateId: 'plate', gradeId: 'normal', specials: false, rng: () => 0 });
  g.state.inventory.push(plate); g.command({ type: 'EQUIP', characterId: g.character.id, itemId: plate.id });
  assert.equal(g.state.battle.combatants.hero.readiness, .5);
  assert.equal(g.snapshot().battleTiming.hero.nextActionMs, 2200);
  g.command({ type: 'ALLOCATE_STAT', characterId: g.character.id, stat: 'INT' });
  g.tick(2199); assert.equal(heals(g).length, 0);
  g.tick(1); assert.equal(heals(g).length, 1);
  assert.equal(heals(g)[0].heal, Math.floor(stats(g.state, g.config).maxHp * .15));
  assert.equal(heals(g)[0].combatTimeMs, 3300); assert.equal(hits(g).length, 0);
});

test('execution revalidates each reservation; invalid skills cost nothing and fall back to one attack', () => {
  const def = SKILL_CATALOG.skills[0], original = structuredClone(def);
  const changes = [
    g => g.command({ type: 'UNEQUIP', characterId: g.character.id, itemId: cmd(g).itemId }),
    g => { g.character.skills = []; },
    () => { def.enabled = false; },
    () => { def.useContexts = ['nonCombat']; },
    g => { g.character.hp = stats(g.state, g.config).maxHp; },
    g => { g.character.attributes.INT = -3; },
    g => { g.state.battle.skillUseCounts.heal = 2; },
    g => { g.state.battle.pendingSkill.characterId = 'other'; },
    g => { g.state.battle.pendingSkill.battleId = 'old'; },
    g => { g.state.battle.pendingSkill.heroActionSeq = -1; }
  ];
  try {
    for (const change of changes) {
      Object.assign(def, structuredClone(original));
      const g = make(); g.command(cmd(g)); change(g);
      const hp = g.character.hp, counts = structuredClone(g.state.battle.skillUseCounts), cooldowns = structuredClone(g.character.skillCooldowns);
      g.tick(2200);
      assert.equal(g.state.battle.pendingSkill, undefined); assert.equal(cancelled(g).length, 1);
      assert.equal(heals(g).length, 0); assert.equal(hits(g).length, 1); assert.equal(g.character.hp, hp);
      assert.deepEqual(g.state.battle.skillUseCounts, counts); assert.deepEqual(g.character.skillCooldowns, cooldowns);
      g.tick(2200); assert.equal(cancelled(g).length, 1); assert.equal(hits(g).length, 2);
    }
  } finally { Object.assign(def, original); }
});

test('death and battle exits discard reservations without heals, cooldowns or use counts', () => {
  const g = make(); g.state.enemy.DEX = 40;
  g.state.enemy.weapon = { damageTypes: ['raw'], fixedDamage: 1000 }; g.rng = n => n - 1;
  g.command(cmd(g)); g.tick(1000);
  assert.equal(g.state.phase, 'DOWNED'); assert.equal(g.character.hp, 0); assert.equal(g.state.battle.pendingSkill, undefined);
  assert.equal(heals(g).length, 0); assert.deepEqual(g.character.skillCooldowns, {}); assert.deepEqual(g.state.battle.skillUseCounts, {});
  for (const end of [h => h.finish(false), h => h.reward('victory'), h => h.beginBattle()]) {
    const h = make(); h.command(cmd(h)); end(h);
    assert.equal(h.state.battle?.pendingSkill, undefined); assert.equal(heals(h).length, 0); assert.deepEqual(h.character.skillCooldowns, {});
  }
  for (const change of [s => { s.phase = 'DOWNED'; }, s => { s.characters[0].hp = 0; }, s => { s.enemy.hp = 0; }]) {
    const h = make(); h.command(cmd(h)); const saved = structuredClone(h.state); change(saved);
    const restored = new Game(h.config, saved); assert.equal(restored.state.battle.pendingSkill, undefined);
  }
});

const records = g => g.events.filter(e => e.type === 'hit' || e.type === 'skill').map(e => e.hit ? ['hit', e.hit.actor, e.hit.actorActionSeq, Math.round(e.hit.combatTimeMs), e.hit.damage] : ['skill', 'hero', e.heroActionSeq, Math.round(e.combatTimeMs), e.healed]);
function run(g, total, pattern, rate = 1) {
  let i = 0;
  while (total > 0) { const step = Math.min(total, pattern[i++ % pattern.length]); g.tick(step / rate, rate); total -= step; }
  while (g.state.pendingGameMs > 0 || g.state.remaining <= 1e-7) g.tick(0);
  return g;
}
test('JSON restoration, offline speed, irregular ticks and event budgets resolve the same queue exactly once', t => {
  t.mock.method(Date, 'now', () => 50000);
  const base = make(20),command=cmd(base); base.command(command); const saved = JSON.parse(JSON.stringify(base.state));
  const restored=new Game(base.config,structuredClone(saved),()=>0);assert.throws(()=>restored.command(command),/이미/);
  const games = [[50], [200], [13, 701, 122, 19, 2450], [8800]].map(pattern => run(new Game(base.config, structuredClone(saved), () => 0), 8800, pattern));
  games.push(run(new Game(base.config, structuredClone(saved), () => 0), 8800, [200], 2));
  const c = structuredClone(base.config); c.actionSpeed.maxEventsPerTick = 1;
  let limited = new Game(c, structuredClone(saved), () => 0); limited.tick(8800);
  assert.equal(heals(limited).length, 1); assert.ok(limited.state.pendingGameMs > 0);
  const events = limited.events; limited = new Game(c, JSON.parse(JSON.stringify(limited.state)), () => 0); limited.events = events;
  games.push(run(limited, 0, [1]));
  for (const g of games) {
    assert.deepEqual(records(g), records(games[0])); assert.equal(heals(g).length, 1); assert.equal(hits(g).length, 7);
    assert.equal(g.state.battle.skillUseCounts.heal, 1); assert.equal(g.character.hp, 6);
    assert.deepEqual(g.character.skillCooldowns, games[0].character.skillCooldowns);
  }
  const online = new Game(base.config, structuredClone(saved), () => 0), offline = new Game(base.config, structuredClone(saved), () => 0);
  online.tick(550, 1); offline.tick(550, 2);
  assert.equal(heals(online).length, 0); assert.equal(heals(offline).length, 1);
});

test('legacy already-used cycles are not replayed as queued skills after loading', () => {
  const g = make(); g.state.battle.skillUsed = true; g.state.battle.skillUseCounts = { heal: 1 };
  g.character.skillCooldowns.heal = { startedAt: 1, readyAt: 2, durationMs: 1 };
  const restored = new Game(g.config, structuredClone(g.state), () => 0);
  assert.throws(() => restored.command(cmd(restored)), /이미/); restored.tick(2200);
  assert.equal(hits(restored).length, 1); assert.equal(heals(restored).length, 0);
  assert.equal(restored.state.battle.skillUseCounts.heal, 1); assert.equal(restored.state.battle.skillUsed, false);
});
