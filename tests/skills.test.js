import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../src/game.js';
import { stats } from '../src/combat.js';
import { generateEquipment } from '../src/equipment.js';
import { SKILL_CATALOG, validateSkillCatalog, initializeSkills, skillValues, equipSkill, useSkill } from '../src/skills.js';
import { skillAvailability } from '../public/skills-view.js';
const config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url)));
const make = (cls = 'wizard') => { const c = structuredClone(config); c.initiative.enemyDEX = -10; const g = new Game(c, null, () => 0); g.create(cls); g.state.risk = 0; return g; };
const item = g => g.state.inventory.find(i => i.slot === 'skill');
const command = g => ({ type: 'USE_SKILL', itemId: item(g).id, battleId: g.state.battle.id, turn: g.state.battle.turn });
const battle = g => { g.beginBattle(); g.state.enemy.hp = 100000; g.state.enemy.base = 0; g.state.hp = 1; };

test('JSON validates duplicate IDs, unknown effects, invalid coefficients and fixed six-slot policy', () => {
  for (const mutate of [c => c.skills.push(c.skills[0]), c => c.skills[0].effect.type = 'unknown', c => c.skills[0].cooldown.baseMs = -1, c => c.maxEquipped = 7]) {
    const c = structuredClone(SKILL_CATALOG); mutate(c); assert.throws(() => validateSkillCatalog(c), /skills.json/);
  }
});
test('new/old characters get heal once, default slot 1, with persistent deliberate unequip and legacy battle migration', () => {
  for (const cls of ['warrior', 'wizard']) {
    const g = make(cls); assert.equal(g.state.inventory.filter(i => i.slot === 'skill').length, 1); assert.equal(g.state.skillSlots.length, 6); assert.equal(g.state.skillSlots[0], item(g).id);
    g.command({ type: 'UNEQUIP', itemId: item(g).id }); const again = new Game(g.config, structuredClone(g.state)); assert.deepEqual(again.state, g.state);
    const old = structuredClone(g.state); old.inventory = old.inventory.filter(i => i.slot !== 'skill'); delete old.skillSlots; delete old.skillGrants; delete old.skillCooldowns; old.hp = 22; old.tactic = 'heal';
    old.battle = { actor: 'hero', ap: 1, attacks: 1, turn: 3, roundEffects: { AR: 99 }, heroReservedAP: 2, tacticUsed: true }; old.phase = 'BATTLE';
    const restored = new Game(g.config, old); assert.equal(restored.state.hp, 22); assert.equal(restored.state.battle.ap, 1); assert.equal(restored.state.battle.attacks, 1); assert.equal(restored.state.battle.roundEffects, undefined); assert.equal(restored.state.tactic, undefined);
    assert.equal(restored.state.skillSlots[0], item(restored).id); assert.deepEqual(new Game(g.config, structuredClone(old)).state, old);
  }
});
test('healing uses effective maxHP/INT, floors once, caps HP; cooldown uses signed DEX with zero floor', () => {
  const def = SKILL_CATALOG.skills[0];
  assert.deepEqual(skillValues(def, { maxHp: 110, INT: 3, DEX: 2 }), { heal: 27, cooldownMs: 18000 });
  assert.equal(skillValues(def, { maxHp: 100, INT: 0, DEX: 2 }).heal, 10);
  assert.equal(skillValues(def, { maxHp: 100, INT: 4, DEX: 2 }).heal, 30);
  assert.equal(skillValues(def, { maxHp: 100, INT: -3, DEX: 2 }).heal, 0);
  assert.equal(skillValues(def, { maxHp: 110, INT: 0, DEX: -2 }).cooldownMs, 22000);
  assert.equal(skillValues(def, { maxHp: 110, INT: 0, DEX: 25 }).cooldownMs, 0);
  for (const cls of ['warrior', 'wizard']) {
    const g = make(cls); battle(g); const hero = stats(g.state, g.config); const expected = Math.floor(hero.maxHp * (.10 + hero.INT * .05));
    g.command(command(g)); assert.equal(g.state.hp, 1 + expected);
    const h = make(cls); battle(h); h.state.hp = stats(h.state, h.config).maxHp - 2; h.command(command(h)); assert.equal(h.state.hp, stats(h.state, h.config).maxHp);
  }
});
test('manual skill preserves AP/attack timer and penalties; no auto skill, per-player-turn lock independent of type/slots', () => {
  const g = make(); battle(g); const before = structuredClone(g.state.battle), remaining = g.state.remaining;
  g.command(command(g)); assert.equal(g.state.battle.ap, before.ap); assert.equal(g.state.battle.attacks, before.attacks); assert.equal(g.state.remaining, remaining);
  const alternate = { ...item(g), id: 'second', templateId: 'second-heal' }; g.state.inventory.push(alternate); g.state.skillSlots[1] = alternate.id;
  const c = structuredClone(SKILL_CATALOG); c.skills.push({ ...c.skills[0], id: alternate.templateId });
  assert.throws(() => useSkill(g.state, alternate, stats(g.state, g.config), { ...command(g), itemId: alternate.id }, Date.now(), c), /이미/);
  g.command({ type: 'UNEQUIP', itemId: item(g).id }); g.command({ type: 'EQUIP', itemId: item(g).id }); assert.throws(() => g.command(command(g)), /이미/);
  const hp = g.state.hp; for (let i = 0; i < 6; i++) g.battleAction(); assert.equal(g.state.battle.turn, 2); assert.equal(g.state.battle.skillUsed, false); assert.equal(g.state.hp, hp);
  const hits = g.events.filter(e => e.type === 'hit' && e.hit.actor === 'hero').map(e => e.hit); assert.equal(hits.length, 3); assert.deepEqual(hits.map(h => h.calculation.acc - hits[0].calculation.acc), [0,-5,-10]);
  assert.throws(() => g.command(command(g)), /대기/);
});
test('reject outside combat, enemy turn, stale battle/round, unequipped and full HP without spending cooldown', () => {
  const g = make(); assert.throws(() => g.command({ type: 'USE_SKILL', itemId: item(g).id }), /전투/); battle(g);
  const cmd = command(g); assert.throws(() => g.command({ ...cmd, turn: 0 }), /턴이 지났/); assert.throws(() => g.command({ ...cmd, battleId: 'old' }), /턴이 지났/);
  g.state.battle.actor = 'enemy'; assert.throws(() => g.command(cmd), /자신의 턴/); g.state.battle.actor = 'hero';
  g.command({ type: 'UNEQUIP', itemId: item(g).id }); assert.throws(() => g.command(cmd), /장착/); g.command({ type: 'EQUIP', itemId: item(g).id });
  g.state.hp = stats(g.state, g.config).maxHp; assert.throws(() => g.command(cmd), /회복할 체력/); assert.equal(g.state.battle.skillUsed, false); assert.deepEqual(g.state.skillCooldowns, {});
});
test('cooldown and turn lock persist after load/class/equipment changes; wall-clock expiry and new turn are both required', () => {
  const g = make(); battle(g); const cmd = command(g); g.command(cmd); const cooldown = structuredClone(g.state.skillCooldowns);
  const r = new Game(g.config, JSON.parse(JSON.stringify(g.state))); assert.throws(() => r.command(cmd), /이미/);
  for (let i = 0; i < 6; i++) r.battleAction(); assert.throws(() => r.command(command(r)), /대기/);
  r.state.skillCooldowns.heal.readyAt = Date.now() - 1; r.command(command(r)); assert.equal(r.state.battle.skillUsed, true);
  g.phase('HOME', 10000); g.command({ type: 'CLASS', classId: 'warrior' }); assert.deepEqual(g.state.skillCooldowns, cooldown);
});
test('six slots, safe slot replacement, no skill sale and no skill stat contribution', () => {
  const g = make(), before = stats(g.state, g.config), def = SKILL_CATALOG.skills[0], c = structuredClone(SKILL_CATALOG);
  for (let i = 1; i < 7; i++) {
    c.skills.push({ ...def, id: `heal-${i}`, grantOnCreate: false });
    const learned = { ...item(g), id: `skill-${i}`, templateId: `heal-${i}` }; g.state.inventory.push(learned);
    if (i < 6) equipSkill(g.state, learned, false, undefined, c); else assert.throws(() => equipSkill(g.state, learned, false, undefined, c), /최대 6/);
  }
  const last = g.state.inventory.at(-1); equipSkill(g.state, last, false, 0, c); assert.equal(g.state.skillSlots[0], last.id); assert.equal(new Set(g.state.skillSlots).size, 6);
  assert.throws(() => equipSkill(g.state, last, false, -1, c)); assert.throws(() => g.command({ type: 'SELL', itemId: item(g).id }), /판매/);
  const count = g.state.inventory.filter(i => i.slot === 'skill').length; g.command({ type: 'SELL_NORMAL' }); assert.equal(g.state.inventory.filter(i => i.slot === 'skill').length, count); assert.deepEqual(stats(g.state, g.config), before);
});
test('only inn departure heals: rewards, level growth, regions, return, class and reload cannot heal', () => {
  const g = make(); g.state.hp = 5; g.state.xp = 39; g.reward('victory'); assert.equal(g.state.hp, 5); g.reward('treasure'); assert.equal(g.state.hp, 5); assert.ok(g.state.level > 1);
  g.enterRegion('volcano'); assert.equal(g.state.hp, 5); g.finish(false); g.advance(); assert.equal(g.state.phase, 'HOME'); assert.equal(g.state.hp, 5);
  g.command({ type: 'CLASS', classId: 'warrior' }); assert.equal(g.state.hp, 5); const restored = new Game(g.config, structuredClone(g.state)); assert.equal(restored.state.hp, 5);
  g.advance(); assert.equal(g.state.hp, stats(g.state, g.config).maxHp); assert.throws(() => g.command({ type: 'TACTIC', tactic: 'heal' }), /지원하지/);
});
test('clockwise cooldown mask progresses and status separates cooldown, used, unavailable and ready', () => {
  const g = make(); battle(g); let s = g.snapshot(), i = s.inventory.find(i => i.slot === 'skill'); assert.equal(skillAvailability(s, i, 0).kind, 'ready');
  i.cooldown = { readyAt: 20000, durationMs: 20000 }; assert.equal(skillAvailability(s, i, 5000).progress, .25); assert.equal(skillAvailability(s, i, 5000).kind, 'cooldown');
  s.battle.skillUsed = true; assert.equal(skillAvailability(s, i, 5000).kind, 'used'); s.phase = 'TRAVEL'; assert.equal(skillAvailability(s, i, 5000).kind, 'unavailable');
  assert.equal(skillAvailability(s, null, 0).kind, 'empty');
});

test('equipped INT is added to the max-HP healing percentage: INT4 heals 30 percent', () => {
  const g = make('wizard');
  const charm = generateEquipment({ slot: 'charm', templateId: 'wisdom-charm', gradeId: 'normal', rng: () => 0 });
  g.state.inventory.push(charm); g.command({ type: 'EQUIP', itemId: charm.id });
  battle(g); const hero = stats(g.state, g.config);
  assert.equal(hero.INT, 4); assert.equal(hero.maxHp, 90);
  const view = g.snapshot().inventory.find(i => i.slot === 'skill'); assert.equal(view.heal, 27);
  g.command(command(g)); assert.equal(g.state.hp, 28);
});
