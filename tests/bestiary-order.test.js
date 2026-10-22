import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MONSTER_CATALOG, ENCOUNTER_CONFIG, validateMonsters, sortedBestiaryEntries, eligibleVariations, generateMonster, recordMonsterEncounter } from '../src/monsters.js';
import { Game } from '../src/game.js';
const config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url)));
const types = ['slime', 'harpy', 'golem', 'ghost'];
const variants = ['slash', 'pierce', 'blunt', 'fire', 'cold', 'lightning', 'corrosion'];
const expected = types.flatMap(type => variants.map(v => `${v}_${type}`));
const clone = () => structuredClone(MONSTER_CATALOG);

test('catalog assigns requested tens without changing RNG candidate order', () => {
  for (const [i, type] of types.entries()) {
    const monster = MONSTER_CATALOG.find(m => m.id === type);
    assert.equal(monster.codexOrder, (i + 1) * 10);
    assert.deepEqual(monster.variation.map(v => v.codexOrder), [10,20,30,40,50,60,70]);
  }
  const original = ['ghost','golem','harpy','slime'].flatMap(type => variants.map(v => `${v}_${type}`));
  assert.deepEqual(eligibleVariations('village').map(({variation}) => variation.id), original);
  assert.deepEqual(sortedBestiaryEntries(Object.fromEntries(original.map(id => [id, {}]))).map(([id]) => id), expected);
  assert.deepEqual(eligibleVariations('village').map(({variation}) => variation.id), original);
});
test('duplicate type numbers fail validation; variation numbers repeat across types', () => {
  assert.doesNotThrow(() => validateMonsters(clone(), ENCOUNTER_CONFIG));
  const catalog = clone(); catalog[1].codexOrder = catalog[0].codexOrder;
  assert.throws(() => validateMonsters(catalog, ENCOUNTER_CONFIG), /duplicate monster codexOrder/);
});
test('duplicate variation numbers fail within the same type', () => {
  const catalog = clone(); catalog[0].variation[1].codexOrder = catalog[0].variation[0].codexOrder;
  assert.throws(() => validateMonsters(catalog, ENCOUNTER_CONFIG), /duplicate variation codexOrder/);
});
test('missing and invalid orders fail at both levels, while intermediate integers pass', () => {
  for (const level of ['monster','variation']) {
    for (const value of [undefined,null,0,-10,1.5,'10',true,NaN,Infinity,Number.MAX_SAFE_INTEGER+1]) {
      const catalog = clone(), target = level === 'monster' ? catalog[0] : catalog[0].variation[0];
      if (value === undefined) delete target.codexOrder; else target.codexOrder = value;
      assert.throws(() => validateMonsters(catalog, ENCOUNTER_CONFIG), new RegExp(`Invalid ${level} codexOrder`));
    }
    const catalog = clone(); (level === 'monster' ? catalog[0] : catalog[0].variation[0]).codexOrder = 15;
    assert.doesNotThrow(() => validateMonsters(catalog, ENCOUNTER_CONFIG));
  }
});
test('old saved discovery order is preserved while snapshots use latest template order', () => {
  const game = new Game(config, null, () => 0); game.create({name:'도감 정렬',appearanceId:'warrior'});
  const pool = eligibleVariations('village');
  for (const id of [...expected].reverse()) {
    let call = 0; const index = pool.findIndex(({variation}) => variation.id === id);
    recordMonsterEncounter(game.state, generateMonster('village', () => call++ === 0 ? index : 0));
  }
  const saved = structuredClone(game.state);
  const restored = new Game(config, structuredClone(saved), () => 0);
  assert.deepEqual(Object.keys(restored.snapshot().bestiary), expected);
  assert.deepEqual(restored.state.bestiary, saved.bestiary);
  const catalog = clone(); catalog.find(m => m.id === 'ghost').codexOrder = 5;
  catalog.find(m => m.id === 'ghost').variation.find(v => v.id === 'corrosion_ghost').codexOrder = 5;
  const reordered = sortedBestiaryEntries(saved.bestiary, catalog);
  assert.equal(reordered[0][0], 'corrosion_ghost');
  assert.deepEqual(saved.bestiary, game.state.bestiary);
  assert.deepEqual(sortedBestiaryEntries({fire_slime:saved.bestiary.fire_slime,slash_harpy:saved.bestiary.slash_harpy}).map(([id])=>id), ['fire_slime','slash_harpy']);
});
test('unknown historical entries remain visible after known entries, ordered by ID', () => {
  const entries = {z_retired:{},slash_ghost:{},a_retired:{},slash_slime:{}};
  assert.deepEqual(sortedBestiaryEntries(entries).map(([id])=>id), ['slash_slime','slash_ghost','a_retired','z_retired']);
});
