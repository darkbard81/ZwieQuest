import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../src/game.js';
const config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url)));
const make = (classId = 'warrior') => { const g = new Game(config, null, () => 0); g.create(classId); return g; };
const select = (g, classId) => g.command({ type: 'CLASS', classId });

test('legacy migration preserves current class exactly, including an in-progress battle, and is idempotent', () => {
  for (const id of ['warrior', 'wizard']) {
    const g = make(id); g.state.level = 9; g.state.xp = 37; g.state.gold = 251;
    g.state.step = 2; g.state.risk = 0; g.beginBattle(); g.state.battle.ap = 2;
    delete g.state.inactiveClasses;
    const legacy = structuredClone(g.state), migrated = new Game(config, structuredClone(legacy));
    for (const key of Object.keys(legacy)) assert.deepEqual(migrated.state[key], legacy[key], key);
    const other = id === 'warrior' ? 'wizard' : 'warrior';
    assert.equal(migrated.snapshot().classProfiles[id].level, 9);
    assert.equal(migrated.snapshot().classProfiles[other].started, false);
    assert.deepEqual(new Game(config, structuredClone(migrated.state)).state, migrated.state);
    migrated.phase('HOME', 15000); select(migrated, other);
    assert.equal(migrated.state.level, 1); assert.equal(migrated.state.xp, 0);
    assert.deepEqual(migrated.state.equipment, {});
    select(migrated, id);
    for (const key of ['level', 'xp', 'equipment', 'inventory', 'gold']) assert.deepEqual(migrated.state[key], legacy[key]);
  }
});

test('level/XP, gear round-trip independently; inventory/gold are shared and HP follows restored stats', () => {
  const g = make(); g.state.level = 7; g.state.xp = 21; g.state.gold = 65;
  const old = structuredClone(g.state), weapon = old.equipment.weapon;
  select(g, 'wizard');
  g.command({ type: 'EQUIP', itemId: weapon });
  g.state.level = 3; g.state.xp = 12; g.state.gold += 10;
  select(g, 'warrior');
  assert.equal(g.state.level, 7); assert.equal(g.state.xp, 21);
  assert.deepEqual(g.state.equipment, old.equipment); assert.equal(g.state.gold, 75);
  assert.deepEqual(g.state.inventory, old.inventory); assert.ok(g.state.hp <= g.snapshot().stats.maxHp);
  select(g, 'wizard');
  assert.equal(g.state.level, 3); assert.equal(g.state.xp, 12);
  assert.deepEqual(g.state.equipment, { weapon }); assert.ok(g.state.hp <= g.snapshot().stats.maxHp);
  assert.equal(g.state.phaseStartedAt, old.phaseStartedAt); assert.equal(g.state.remaining, old.remaining);
});

test('earned XP affects only the active class, while new loot and gold stay shared across switches and reloads', () => {
  let g = make(); g.state.level = 5; g.state.xp = 18;
  select(g, 'wizard'); g.state.xp = 39; g.state.risk = 0;
  g.reward('treasure'); assert.equal(g.state.level, 2);
  const earned = g.snapshot(), count = g.state.inventory.length;
  g.phase('HOME', 15000); select(g, 'warrior');
  assert.equal(g.state.level, 5); assert.equal(g.state.xp, 18);
  assert.equal(g.state.inventory.length, count); assert.equal(g.state.gold, earned.gold);
  g = new Game(config, JSON.parse(JSON.stringify(g.state)));
  select(g, 'wizard'); assert.equal(g.state.level, earned.level); assert.equal(g.state.xp, earned.xp);
  assert.equal(g.state.gold, earned.gold); assert.equal(g.state.inventory.length, count);
});

test('inactive gear cannot be sold; the same item can be selected by both classes without duplication', () => {
  const g = make(), id = g.state.equipment.weapon, count = g.state.inventory.length;
  select(g, 'wizard');
  assert.throws(() => g.command({ type: 'SELL', itemId: id }), /전사/);
  g.command({ type: 'EQUIP', itemId: id });
  assert.deepEqual(new Set(g.snapshot().equipmentUsers[id]), new Set(['warrior', 'wizard']));
  assert.equal(g.state.inventory.length, count);
  g.command({ type: 'UNEQUIP', itemId: id });
  assert.throws(() => g.command({ type: 'SELL', itemId: id }), /전사/);
  select(g, 'warrior'); g.command({ type: 'UNEQUIP', itemId: id });
  const value = g.state.inventory.find(i => i.id === id).value;
  g.command({ type: 'SELL', itemId: id }); select(g, 'wizard');
  assert.equal(g.state.gold, value); assert.equal(g.state.inventory.length, count - 1);
  assert.deepEqual(g.state.equipment, {});
});

test('same-class skins do not create new progress or reset gear, and switching is still HOME-only', () => {
  const g = make(); g.state.level = 8; g.state.xp = 32;
  const before = structuredClone(g.state);
  for (const appearanceId of ['barbarian', 'ranger', 'cat', 'lamia']) {
    g.command({ type: 'APPEARANCE', appearanceId });
    for (const key of ['level', 'xp', 'equipment', 'remaining']) assert.deepEqual(g.state[key], before[key]);
    assert.deepEqual(g.state.inactiveClasses, {});
  }
  g.advance();
  assert.throws(() => select(g, 'wizard'), /여관/);
  assert.equal(g.state.classId, 'warrior'); assert.deepEqual(g.state.inactiveClasses, {});
});
