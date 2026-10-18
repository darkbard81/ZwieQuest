import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../src/game.js';
import { generateEquipment } from '../src/equipment.js';
import { sortInventory } from '../public/inventory-order.js';
const config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url)));

test('bulk sale preserves all classes equipped gear and higher grades, credits exactly once and survives reload', () => {
  const g = new Game(config); g.create('warrior');
  const warriorGear = { ...g.state.equipment };
  g.command({ type: 'CLASS', classId: 'wizard' });
  const make = (slot, gradeId) => generateEquipment({ slot, gradeId, rng: () => 0 });
  const equipped = make('weapon', 'normal');
  const sale = ['weapon', 'armor', 'charm'].map(slot => make(slot, 'normal'));
  const keep = ['fine', 'excellent', 'superior', 'legendary'].map(grade => make('charm', grade));
  g.state.inventory.push(equipped, ...sale, ...keep);
  g.command({ type: 'EQUIP', itemId: equipped.id });
  const expected = g.state.inventory.filter(item => !sale.includes(item));
  const gold = sale.reduce((sum, item) => sum + item.value, 0);
  assert.deepEqual(g.snapshot().normalSale, { count: 3, gold });
  g.command({ type: 'SELL_NORMAL', itemIds: expected.map(item => item.id), gold: 999999 });
  assert.deepEqual(g.state.inventory, expected); assert.equal(g.state.gold, gold);
  assert.deepEqual(g.state.inactiveClasses.warrior.equipment, warriorGear);
  assert.equal(g.state.equipment.weapon, equipped.id);
  const seq = g.state.eventSeq;
  g.command({ type: 'SELL_NORMAL' });
  assert.equal(g.state.gold, gold); assert.equal(g.state.eventSeq, seq);
  const restored = new Game(config, JSON.parse(JSON.stringify(g.state)));
  assert.deepEqual(restored.state.inventory, expected); assert.equal(restored.state.gold, gold);
  assert.deepEqual(restored.snapshot().normalSale, { count: 0, gold: 0 });
});

test('inventory sorts active gear first, other class gear next, then descending rarity within each group and filters', () => {
  const item = (id, gradeId, slot = 'weapon') => ({ id, gradeId, slot });
  const inventory = [item('normal', 'normal'), item('active', 'normal'), item('legendary', 'legendary'), item('fine', 'fine'), item('other', 'normal'), item('superior', 'superior'), item('excellent', 'excellent'), item('new-legendary', 'legendary', 'charm')];
  const state = { inventory, equipment: { weapon: 'active' }, equipmentUsers: { other: ['wizard'] } };
  const before = structuredClone(inventory);
  assert.deepEqual(sortInventory(state).map(i => i.id), ['active', 'other', 'new-legendary', 'legendary', 'superior', 'excellent', 'fine', 'normal']);
  assert.deepEqual(sortInventory(state, 'weapon').map(i => i.id), ['active', 'other', 'legendary', 'superior', 'excellent', 'fine', 'normal']);
  assert.deepEqual(inventory, before);
});
