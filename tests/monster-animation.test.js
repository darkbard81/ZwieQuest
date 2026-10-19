import test from 'node:test';
import assert from 'node:assert/strict';
import { createMonsterAnimator, MONSTER_MOTION } from '../public/monster-animation.js';
const state = (phase = 'BATTLE', extra = {}) => ({ phase, activeCharacterId: 'hero', progressId: 'p', run: 1, mapId: 'village', currentNodeId: 'n', theme: 'village', battle: { id: 'battle-1' }, enemy: { img_path: 'slime.webp' }, ...extra });
const hit = (actor, damage = 1) => ({ type: 'hit', hit: { actor, damage } });
test('ordinary monsters and bosses share the same bounded ground-anchored motion', () => {
  for (const enemy of [{ img_path: 'slime.webp' }, { boss: true }, { name: 'legacy' }]) {
    const a = createMonsterAnimator(); a.update(state('BATTLE', { enemy }));
    const idle = a.sample(MONSTER_MOTION.idleMs / 4);
    assert.equal(idle.scaleX, 1.03); assert.equal(idle.scaleY, .97); assert.equal(idle.x, 0);
    a.events([hit('enemy', 0)], 1000);
    assert.equal(a.sample(1000).action, 'attack'); assert.ok(a.sample(1225).x < -18);
    assert.equal(a.sample(1360).action, 'idle');
  }
});
test('misses do not flinch; damage interrupts attack and blocks lower-priority attack', () => {
  const a = createMonsterAnimator(); a.update(state());
  a.events([hit('hero', 0)], 0); assert.equal(a.sample(50).action, 'idle');
  a.events([hit('enemy')], 100); a.events([hit('hero')], 150);
  assert.equal(a.sample(200).action, 'hit'); assert.equal(a.sample(200).tint, 0xffbbbb);
  a.events([hit('enemy')], 220); assert.equal(a.sample(230).action, 'hit');
  a.events([hit('hero'), hit('enemy')], 240); assert.equal(a.sample(250).action, 'hit');
  assert.equal(a.sample(420).action, 'idle');
});
test('live victory keeps the previous image through snapshots then releases it without replay', () => {
  for (const type of ['victory', 'boss']) {
    const a = createMonsterAnimator(); a.update(state());
    a.update(state('TREASURE', { enemy: null, battle: null }));
    a.events([hit('hero'), { type }], 100);
    const pose = a.sample(340); assert.equal(pose.action, 'down'); assert.equal(pose.enemy.img_path, 'slime.webp');
    assert.equal(pose.alpha, .5); assert.ok(pose.scaleY < 1);
    a.update(state('TREASURE', { enemy: null, battle: null }));
    a.events([hit('enemy')], 350); assert.equal(a.sample(400).action, 'down');
    assert.equal(a.sample(580), null); a.events([{ type }], 590); assert.equal(a.sample(600), null);
  }
});
test('ordinary treasure, reload and a different character/context never borrow a previous opponent', () => {
  const a = createMonsterAnimator(); a.update(state('TREASURE', { enemy: null }));
  a.events([{ type: 'victory' }], 0); assert.equal(a.sample(100), null);
  a.update(state()); a.update(state('HOME')); a.update(state('TREASURE')); a.events([{ type: 'victory' }], 200);
  assert.equal(a.sample(250), null);
  a.update(state()); a.update(state('TREASURE', { activeCharacterId: 'other' })); a.events([{ type: 'victory' }], 300);
  assert.equal(a.sample(350), null);
});
test('new battles and disconnect clear effects; player defeat can finish the monster attack', () => {
  const a = createMonsterAnimator(); a.update(state()); a.events([hit('hero')], 0);
  a.update(state('BATTLE', { battle: { id: 'battle-2' } })); assert.equal(a.sample(10).action, 'idle');
  a.events([hit('enemy')], 20); a.clear(); assert.equal(a.sample(30).action, 'idle');
  a.update(state('DOWNED')); a.events([hit('enemy')], 100);
  assert.equal(a.sample(200).action, 'attack'); assert.equal(a.sample(460), null);
  a.update(state()); a.update(state('TREASURE')); a.events([{ type: 'victory' }], 500);
  a.clear(); assert.equal(a.sample(510), null);
});
test('reduced motion retains only brief tint and death fade, with no displacement or squash', () => {
  const a = createMonsterAnimator(); a.update(state());
  for (const events of [[], [hit('enemy')], [hit('hero')]]) {
    a.events(events, 0); const pose = a.sample(100, true);
    assert.deepEqual([pose.x, pose.scaleX, pose.scaleY], [0, 1, 1]);
  }
  a.update(state('TREASURE')); a.events([{ type: 'victory' }], 100);
  const pose = a.sample(340, true); assert.deepEqual([pose.x, pose.scaleX, pose.scaleY, pose.alpha], [0, 1, 1, .5]);
});
