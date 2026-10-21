import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../src/game.js';
import { APPEARANCES, restRemaining, mirrorAppearance } from '../public/appearances.js';
const config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url)));
const make = cls => { const game = new Game(config, null, () => 0); game.create({name: '모험가', appearanceId: cls || 'warrior'});game.state.homePaused=false; return game; };

test('all six appearances are cosmetic and produce the same starting stats',()=>{
 let expected;for(const appearance of APPEARANCES){const g=make(appearance.id);assert.equal(g.character.appearanceId,appearance.id);assert.equal(appearance.classId,undefined);expected ||= g.snapshot().stats;assert.deepEqual(g.snapshot().stats,expected);const restored=new Game(config,structuredClone(g.state));assert.equal(restored.character.appearanceId,appearance.id);}
});
test('rest countdown uses rate, selected character survives departure and cannot switch during travel',()=>{
 const g=make('cat');g.tick(2000,1);g.tick(2000,1.5);assert.equal(g.state.remaining,10000);assert.equal(restRemaining(g.state,100,1100,1.5),8500);g.tick(10000/1.5,1.5);assert.equal(g.state.phase,'CHOICE_WAIT');assert.equal(g.character.appearanceId,'cat');assert.throws(()=>g.selectCharacter(g.character.id),/여관/);
});

test('all shipped appearances provide complete six-action atlases and correct left/right orientation', () => {
  for (const appearance of APPEARANCES) {
    const meta = JSON.parse(readFileSync(new URL(`../public/assets/character/${appearance.id}/sprite.json`, import.meta.url)));
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
