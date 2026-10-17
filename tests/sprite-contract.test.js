import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { APPEARANCES } from '../public/appearances.js';
import { PLAYBACK, SPRITE_FRAME_COUNT } from '../public/hero-animation.js';

// Authored contract: do not derive expected timings from the files under test.
const contract = [
  ['Front_Idle', 2000, true, false],
  ['Front_Victory', 2000, false, false],
  ['Side_Walk', 1200, true, false],
  ['Side_Attack', 650, false, false],
  ['Side_Down', 1500, false, true],
  ['Side_Hit', 360, false, false]
];
function validate(meta, id) {
  assert.equal(meta.schemaVersion, 3, id);
  assert.deepEqual([meta.frameWidth, meta.frameHeight, meta.columns, meta.rows], [256, 256, 8, 18], id);
  assert.equal(Object.keys(meta.frames).length, 144, id);
  assert.deepEqual(Object.keys(meta.animations).sort(), contract.map(([name]) => name).sort(), id);
  for (const [row, [action, duration, loop, hold]] of contract.entries()) {
    const label = `${id}/${action}`, anim = meta.animations[action];
    assert.equal(anim.frameCount, 24, label);
    assert.equal(anim.durationMs, duration, `${label} durationMs`);
    assert.equal(anim.loop, loop, `${label} loop`);
    assert.equal(anim.holdLastFrame, hold, `${label} holdLastFrame`);
    assert.deepEqual(anim.frameNames, Array.from({length:24}, (_,i)=>`${action}_${String(i).padStart(2,'0')}`), label);
    let total = 0;
    for (const [i, name] of anim.frameNames.entries()) {
      const f = meta.frames[name];
      assert.deepEqual(f.frame, {x:i%8*256,y:(row*3+Math.floor(i/8))*256,w:256,h:256}, `${label}/${i}`);
      assert.ok(Math.abs(f.durationMs-duration/24)<1e-8, `${label}/${i} durationMs`);
      total += f.durationMs;
    }
    assert.ok(Math.abs(total-duration)<1e-8, `${label} total frame duration`);
  }
}
test('runtime playback follows the authored shared timing contract', () => {
  assert.equal(SPRITE_FRAME_COUNT,24);
  assert.equal(Object.keys(PLAYBACK).length,6);
  for(const [action,duration,loop] of contract){
    assert.equal(PLAYBACK[action].duration,duration,action);
    assert.equal(Boolean(PLAYBACK[action].loop),loop,action);
  }
});
for (const appearance of APPEARANCES) {
  test(`${appearance.id}: sprite.json animation/frame times, loops and atlas layout match the common contract`, () => {
    const dir = new URL(`../public/assets/${appearance.id}/`, import.meta.url);
    validate(JSON.parse(readFileSync(new URL('sprite.json',dir))),appearance.id);
    const png=readFileSync(new URL('sprite.png',dir));
    assert.equal(png.subarray(1,4).toString(),'PNG');
    assert.deepEqual([png.readUInt32BE(16),png.readUInt32BE(20),png[25]],[2048,4608,6],'PNG dimensions and RGBA type');
    assert.equal(appearance.idleDurationMs,undefined);assert.equal(appearance.idleFrameCount,undefined);
  });
}
test('contract rejects the former per-character timing and frame-count regressions',()=>{
  const base=JSON.parse(readFileSync(new URL('../public/assets/warrior/sprite.json',import.meta.url)));
  for(const [action,duration] of [['Front_Idle',6000],['Front_Victory',3500],['Side_Attack',1000],['Side_Hit',600],['Side_Walk',2400],['Side_Down',1800]]){
    const meta=structuredClone(base);meta.animations[action].durationMs=duration;
    assert.throws(()=>validate(meta,'regression'),new RegExp(`${action} durationMs`));
  }
  const meta=structuredClone(base);meta.frames.Front_Idle_00.durationMs=250;
  assert.throws(()=>validate(meta,'regression'),/Front_Idle\/0 durationMs/);
  const expanded=structuredClone(base);expanded.animations.Front_Idle.frameCount=72;
  assert.throws(()=>validate(expanded,'regression'),/Front_Idle/);
});
