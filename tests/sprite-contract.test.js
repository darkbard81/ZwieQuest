import test from 'node:test';
import { losslessWebpInfo } from './helpers/webp.js';
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
  assert.equal(meta.schemaVersion, 4, id);
  assert.deepEqual([meta.frameWidth, meta.frameHeight, meta.columns, meta.rows], [512, 512, 8, 3], id);
  assert.equal(meta.displaySize,256);assert.equal(meta.layout,'action-sheets');
  assert.deepEqual(meta.normalization.translation,[0,0]);assert.equal(meta.normalization.perFrameAlignment,false);
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
      assert.equal(f.image,`sheets/${action}.webp`);
      assert.equal(f.sourceFrameIndex,anim.sourceFrameIndices[i]);
      assert.ok(Math.abs(f.sourceTimeSeconds-f.sourceFrameIndex/anim.sourceFps)<1e-8);
      assert.deepEqual(f.frame, {x:i%8*512,y:Math.floor(i/8)*512,w:512,h:512}, `${label}/${i}`);
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
    const dir = new URL(`../public/assets/character/${appearance.id}/`, import.meta.url);
    validate(JSON.parse(readFileSync(new URL('sprite.json',dir))),appearance.id);
    for(const [action] of contract){
      const data=readFileSync(new URL(`sheets/${action}.webp`,dir));
      if (appearance.rgbQuality === 90) {
        assert.equal(data.toString('ascii',0,4),'RIFF'); assert.equal(data.toString('ascii',8,12),'WEBP');
        const chunks = new Map();
        for(let offset=12;offset+8<=data.length;){const type=data.toString('ascii',offset,offset+4),size=data.readUInt32LE(offset+4);assert.ok(offset+8+size<=data.length);chunks.set(type,data.subarray(offset+8,offset+8+size));offset+=8+size+(size&1);}
        assert.ok(chunks.has('VP8 '));assert.ok(chunks.has('ALPH'));
        const extended=chunks.get('VP8X');assert.ok(extended[0]&16);assert.equal(extended.readUIntLE(4,3)+1,4096);assert.equal(extended.readUIntLE(7,3)+1,1536);
        const meta=JSON.parse(readFileSync(new URL('sprite.json',dir)));assert.equal(meta.encoding.rgbQuality,90);assert.equal(meta.encoding.alphaQuality,100);assert.equal(meta.encoding.alphaLosslessVerified,true);
      } else assert.deepEqual(losslessWebpInfo(data),{width:4096,height:1536,alpha:true},'lossless WebP dimensions and transparency');
    }
    assert.equal(appearance.idleDurationMs,undefined);assert.equal(appearance.idleFrameCount,undefined);
  });
}
