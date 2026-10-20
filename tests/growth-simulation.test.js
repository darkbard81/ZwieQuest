import test from 'node:test';
import assert from 'node:assert/strict';
import { balancedAttributes, scenarioMonster, prepareCharacter, startScenarioBattle, runGrowth, markdownReport, csvReport } from '../scripts/simulate-growth.js';
import { pointBudget } from '../src/characters.js';
import { EQUIPMENT_CATALOG } from '../src/equipment.js';
import { ENCOUNTER_CONFIG, eligibleVariations } from '../src/monsters.js';
import { stats } from '../src/combat.js';
import { simulateBattle } from '../scripts/combat-simulation.js';

test('growth spends the entire point budget evenly without taking earlier points away', () => {
  let previous = balancedAttributes(1);
  for (let level = 1; level <= 50; level++) {
    const attributes = balancedAttributes(level), values = Object.values(attributes);
    assert.equal(values.reduce((a, b) => a + b, 0), pointBudget(level));
    assert.ok(Math.max(...values) - Math.min(...values) <= 1);
    for (const key of Object.keys(attributes)) assert.ok(attributes[key] >= previous[key]);
    previous = attributes;
  }
});

test('scenario levels and every grade use live derived stats, all variants, and paired attribute draws', () => {
  const originalRules = structuredClone(ENCOUNTER_CONFIG), seen = new Set();
  for (const level of [1, 10, 50]) for (let seed = 1; seed <= 100; seed++) {
    let normal;
    for (const grade of EQUIPMENT_CATALOG.grades) {
      const enemy = scenarioMonster(level, grade.id, seed);
      seen.add(enemy.variationId);
      assert.equal(enemy.boss, false); assert.equal(enemy.level, level); assert.equal(enemy.gradeId, grade.id);
      assert.equal(enemy.weapon.gradeId, grade.id); assert.equal(enemy.armor.gradeId, grade.id);
      assert.equal(Object.values(enemy.allocatedAttributes).reduce((a, b) => a + b, 0), pointBudget(level));
      assert.equal(enemy.maxHp, Math.floor((50 + 10 * (level - 1)) * (100 + 5 * enemy.CON) / 100));
      assert.equal(enemy.AR, 3 + grade.AR); assert.equal(enemy.PEN, 5 + grade.PEN);
      normal ||= enemy;
      assert.equal(enemy.variationId, normal.variationId);
      assert.deepEqual(enemy.attributes, normal.attributes);
    }
  }
  assert.equal(seen.size, eligibleVariations('village').length);
  assert.deepEqual(ENCOUNTER_CONFIG, originalRules);
  assert.throws(() => scenarioMonster(1, 'unknown', 1));
});

test('character setup keeps full HP and normal gear and starts a fresh timed battle', () => {
  for (const build of ['melee', 'staff']) {
    const game = prepareCharacter(build, 20);
    assert.deepEqual(game.character.attributes, balancedAttributes(20));
    assert.equal(game.character.hp, stats(game.state, game.config).maxHp);
    assert.equal(game.state.inventory.length, 2);
    for (const item of game.state.inventory) { assert.equal(item.gradeId, 'normal'); assert.equal(item.special, null); }
    startScenarioBattle(game, 25, 'legendary', 7);
    assert.equal(game.state.enemy.level, 25);
    assert.equal(game.state.battle.elapsedMs, 0);
    assert.equal(game.state.battle.actionSeq, 0);
    assert.equal(Object.keys(game.state.bestiary).length, 1);
    assert.ok(game.state.bestiary[game.state.enemy.variationId]);
    const capped = simulateBattle(game, 1);
    assert.equal(capped.capped, true); assert.equal(capped.won, false);
  }
});

test('report separates character growth, enemy levels and grades with reproducible complete counts', () => {
  const options = { levels: [1, 10], offsets: [0, 5], samples: 3 };
  const report = runGrowth(options), repeated = runGrowth(options);
  assert.deepEqual(report, repeated);
  assert.equal(report.rows.length, 40); assert.equal(report.totalBattles, 120);
  for (const row of report.rows) {
    assert.equal(row.enemyLevel, row.characterLevel + row.levelOffset);
    assert.equal(row.wins + row.losses + row.timeouts, row.samples);
    assert.equal(Object.values(row.variations).reduce((a, b) => a + b, 0), row.samples);
    assert.equal(Object.values(row.monsters).reduce((n, m) => n + m.wins, 0), row.wins);
    assert.ok(Math.abs(row.winPercent - row.wins / row.samples * 100) < 1e-10);
    assert.ok(row.win95Percent[0] >= 0 && row.win95Percent[1] <= 100);
    assert.ok(Number.isFinite(row.meanTimeMs));
  }
  assert.match(markdownReport(report), /동레벨/);
  assert.equal(csvReport(report).trim().split('\n').length, report.rows.length + 1);
  assert.throws(() => runGrowth({ samples: 0 }));
});
