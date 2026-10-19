import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../src/game.js';
import { APPEARANCES, restRemaining, mirrorAppearance } from '../public/appearances.js';
const config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url)));
const make = cls => { const game = new Game(config, null, () => 0); game.create(cls || 'warrior'); return game; };

test('six appearances share progress within their class, with a fresh Wizard profile and unchanged rest', () => {
  const game = make();
  game.state.level = 4; game.state.xp = 17; game.state.gold = 99;
  game.tick(1200, 1.5);
  const before = structuredClone(game.state);
  for (const appearance of APPEARANCES) {
    game.command({ type: 'APPEARANCE', appearanceId: appearance.id });
    assert.deepEqual(game.state.inventory, before.inventory);
    const state = game.snapshot();
    assert.equal(state.appearanceId, appearance.id);
    assert.equal(state.classId, appearance.id === 'wizard' ? 'wizard' : 'warrior');
    for (const key of ['gold', 'remaining', 'duration', 'phaseStartedAt']) assert.deepEqual(state[key], before[key], key);
    assert.equal(state.level, state.classId === 'wizard' ? 1 : before.level);
    assert.equal(state.xp, state.classId === 'wizard' ? 0 : before.xp);
    assert.deepEqual(state.equipment, state.classId === 'wizard' ? {} : before.equipment);
    const baseline = make(state.classId); baseline.state.level = state.level; baseline.state.inventory = state.inventory; baseline.state.equipment = state.equipment;
    assert.deepEqual(state.stats, baseline.snapshot().stats);
  }
});

test('rest retains rates, no selection departs with existing appearance, and selection closes on departure', () => {
  const game = make(); assert.equal(game.state.remaining, 15000);
  game.command({ type: 'APPEARANCE', appearanceId: 'cat' });
  game.tick(2000, 1); game.tick(2000, 1.5); assert.equal(game.state.remaining, 10000);
  assert.equal(restRemaining(game.state, 100, 1100, 1.5), 8500);
  game.tick(10000 / 1.5, 1.5);
  assert.equal(game.state.phase, 'CHOICE_WAIT'); assert.equal(game.state.appearanceId, 'cat');
  assert.throws(() => game.command({ type: 'APPEARANCE', appearanceId: 'wizard' }), /여관/);
});

test('save reload restores appearance, old saves migrate, invalid and expired requests cannot change state', () => {
  const game = make('wizard'); const old = structuredClone(game.state); delete old.appearanceId;
  assert.equal(new Game(config, old).state.appearanceId, 'wizard');
  game.command({ type: 'APPEARANCE', appearanceId: 'lamia' });
  const reloaded = new Game(config, JSON.parse(JSON.stringify(game.state)));
  assert.equal(reloaded.state.appearanceId, 'lamia'); assert.equal(reloaded.state.classId, 'warrior');
  assert.throws(() => reloaded.command({ type: 'APPEARANCE', appearanceId: '../wizard' }), /외형/);
  reloaded.state.remaining = 0;
  assert.throws(() => reloaded.command({ type: 'APPEARANCE', appearanceId: 'wizard' }), /선택 시간/);
  assert.equal(reloaded.state.appearanceId, 'lamia');
});

test('appearance and class changes preserve skill slots and cannot heal', () => {
  const game = make();  game.state.hp = 20;
  game.command({ type: 'APPEARANCE', appearanceId: 'ranger' });
  assert.ok(game.state.skillSlots[0]); assert.equal(game.state.hp, 20);
  game.command({ type: 'APPEARANCE', appearanceId: 'wizard' });
  assert.equal(game.state.hp, 20); assert.ok(game.state.skillSlots[0]);
  game.command({ type: 'CLASS', classId: 'warrior' });
  assert.equal(game.state.appearanceId, 'warrior');
});

test('all shipped appearances provide complete six-action atlases and correct left/right orientation', () => {
  for (const appearance of APPEARANCES) {
    const meta = JSON.parse(readFileSync(new URL(`../public/assets/${appearance.id}/sprite.json`, import.meta.url)));
    for (const action of ['Front_Idle', 'Front_Victory', 'Side_Walk', 'Side_Attack', 'Side_Hit', 'Side_Down']) {
      assert.equal(meta.animations[action].frameNames.length, 24);
      for (const name of meta.animations[action].frameNames) {
        const f = meta.frames[name].frame;
        assert.ok(f.x >= 0 && f.y >= 0 && f.x + f.w <= meta.columns * meta.frameWidth && f.y + f.h <= meta.rows * meta.frameHeight);
      }
    }
    assert.equal(mirrorAppearance(meta, { action: 'Front_Idle', mirrored: false }), false);
    assert.equal(mirrorAppearance(meta, { action: 'Side_Attack', mirrored: false }), meta.facing === 'left');
    assert.equal(mirrorAppearance(meta, { action: 'Side_Walk', mirrored: true }), meta.facing !== 'left');
  }
});
