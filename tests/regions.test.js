import test from 'node:test';
import { losslessWebpInfo } from './helpers/webp.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { REGIONS } from '../public/regions.js';
import { Game, THEMES } from '../src/game.js';

const config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url)));
const names = { village: '새싹마을', volcano: '홍련 분화구', snow: '백야 설원', desert: '산성 호수', beach: '낙뢰 고원' };
const oldNames = { village: '바람꽃 마을', volcano: '잿불 화산', snow: '별빛 설원', desert: '황금빛 사막', beach: '푸른달 해변' };

test('region rename preserves every saved route and in-flight progress without regeneration', () => {
  const game = new Game(config, null, n => n - 1); game.create({name: '모험가', appearanceId: 'warrior'});game.state.homePaused=false;
  game.advance(); game.choose('left');
  game.state.checkpointHistory = [{ mapId: 'desert', nodeId: game.state.maps.desert.rootId, firstPassedAt: 123 }];
  game.state.departureMapId = 'desert'; game.rememberExploration();
  const expected = structuredClone(game.state), saved = structuredClone(expected);
  for (const [id, map] of Object.entries(saved.maps)) {
    map.name = oldNames[id];
    for (const node of Object.values(map.nodes)) {
      if (node.kind === 'exit') node.label = `${oldNames[node.region]} 연결`;
      else node.label = node.label.replace(names[id], oldNames[id]);
    }
  }
  const restored = new Game(config, saved, () => { throw Error('Names must not regenerate maps or reroll equipment'); });
  assert.deepEqual(restored.state, expected);
  assert.deepEqual(new Game(config, structuredClone(restored.state)).state, expected);
  assert.deepEqual(Object.fromEntries(THEMES.map(({ id, name }) => [id, name])), names);
});

test('route PNGs and lossless WebP canvas backgrounds preserve dimensions', () => {
  const dimensions = (url, expected) => {
    const data = readFileSync(new URL(`../public${url.split('?')[0]}`, import.meta.url));
    assert.equal(data.subarray(1, 4).toString(), 'PNG');
    assert.deepEqual([data.readUInt32BE(16), data.readUInt32BE(20)], expected, url);
    assert.equal(data[24], 8); assert.equal(data[25], 2, 'opaque RGB');
  };
  for (const region of Object.values(REGIONS)) dimensions(region.route, [1536, 1024]);
  const expected = {"village": [1672, 941], "volcano": [1672, 941], "beach": [1672, 941], "desert": [1672, 940], "snow": [1672, 941], "pub": [1448, 1086]};
  for(const [id,size] of Object.entries(expected)){
    const url=id==='pub'?'/assets/pub.webp':REGIONS[id].canvas;
    assert.ok(url.split('?')[0].endsWith('.webp'));
    const info=losslessWebpInfo(readFileSync(new URL(`../public${url.split('?')[0]}`,import.meta.url)));
    assert.deepEqual([info.width,info.height],size,id);
    assert.equal(info.alpha,false,id+' remains opaque');
  }
});
