import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { REGIONS, validateRegions, publicRegions } from '../src/regions.js';
import { mapDefinitions, generateMap, reachable, maxNodes } from '../src/maps.js';
import { ENCOUNTER_CONFIG, generateMonster } from '../src/monsters.js';
import { Game } from '../src/game.js';
const config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url)));
function rng(seed) { let x = seed; return n => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x % n; }; }
function assertTree(map) {
  assert.equal(reachable(map).size, Object.keys(map.nodes).length);
  const parents = new Map();
  for (const node of Object.values(map.nodes)) {
    assert.ok(node.depth <= map.depth);
    if (!node.edges) continue;
    assert.notEqual(node.edges.left, node.edges.right);
    for (const child of Object.values(node.edges)) {
      assert.equal(map.nodes[child].depth, node.depth + 1);
      parents.set(child, (parents.get(child) || 0) + 1);
    }
  }
  for (const node of Object.values(map.nodes)) assert.equal(parents.get(node.id) || 0, node.id === map.rootId ? 0 : 1);
  for (const id of map.terminalIds) assert.equal(map.nodes[id].depth, map.depth);
}

test('region data has one file source and encounter compatibility uses the same object', () => {
  assert.deepEqual(REGIONS, JSON.parse(readFileSync(new URL('../data-templates/regions.json', import.meta.url))));
  assert.equal(ENCOUNTER_CONFIG.regions, REGIONS);
  assert.equal(Object.hasOwn(JSON.parse(readFileSync(new URL('../data-templates/encounters.json', import.meta.url))), 'regions'), false);
  assert.ok(Object.values(REGIONS).every(region => region.depth === 10));
  const game = new Game(config, null, rng(1));
  game.state.checkpointHistory = Object.values(game.state.maps).map(map => ({ mapId: map.id, nodeId: map.rootId }));
  for (const start of game.snapshot().availableStarts) {
    const region = REGIONS[start.id];
    assert.equal(start.label, `${region.name} (레벨: ${region.minLevel}~${region.maxLevel})`);
  }
  for (const region of Object.values(publicRegions())) {
    assert.equal(Object.hasOwn(region, 'exits'), false);
    assert.equal(Object.hasOwn(region, 'boss'), false);
    assert.equal(Object.hasOwn(region, 'allowedDamageTypes'), false);
  }
});

test('different regional depths retain all destinations and valid trees across seeds and extreme draws', () => {
  // Default depth 10, the same seeds and extreme draws are covered in maps.test.js.
  for (const depth of [4, 5, 6, 8, 12, 20]) {
    const regions = structuredClone(REGIONS);
    for (const region of Object.values(regions)) region.depth = depth;
    const defs = mapDefinitions(regions);
    for (const id of Object.keys(regions)) for (const random of [() => 0, n => n - 1, ...Array.from({ length: 25 }, (_, i) => rng(i + 1))]) {
      const map = generateMap(id, random, defs);
      assert.equal(map.depth, depth); assertTree(map);
      const last = Object.values(map.nodes).filter(node => node.depth === depth);
      assert.equal(last.length, id === 'village' ? 10 : 2);
      assert.ok(last.every(node => node.id.startsWith(`${id}:${depth}:`)));
      for (let d = 0; d <= depth; d++) assert.ok(Object.values(map.nodes).filter(node => node.depth === d).length <= maxNodes(d, depth, last.length));
    }
  }
  for (const depth of [1, 2, 3]) {
    const regions = structuredClone(REGIONS); regions.snow.depth = depth;
    const map = generateMap('snow', rng(4), mapDefinitions(regions));
    assert.equal(map.depth, depth); assertTree(map);
  }
});

test('new region and its village exit are driven by configuration with matching monster levels and public data', () => {
  const regions = structuredClone(REGIONS);
  regions.forest = { ...regions.snow, name: '시험 숲', depth: 12, minLevel: 21, maxLevel: 25, exits: [] };
  regions.village.exits.push('forest');
  const defs = mapDefinitions(regions), rules = { ...ENCOUNTER_CONFIG, regions };
  for (let seed = 1; seed <= 30; seed++) {
    const village = generateMap('village', rng(seed), defs), forest = generateMap('forest', rng(seed), defs);
    assertTree(village); assertTree(forest);
    assert.equal(Object.values(village.nodes).filter(node => node.kind === 'exit' && node.region === 'forest').length, 1);
    assert.equal(forest.depth, 12);
  }
  assert.equal(generateMonster('forest', () => 0, undefined, rules).level, 21);
  assert.equal(generateMonster('forest', n => n - 1, undefined, rules).level, 25);
  assert.equal(publicRegions(regions).forest.name, '시험 숲');
});

test('invalid depths and exit references fail before generating a map', () => {
  for (const depth of [0, -1, 1.5, '10', 3]) {
    const regions = structuredClone(REGIONS); regions.village.depth = depth;
    assert.throws(() => mapDefinitions(regions), /depth/);
  }
  const regions = structuredClone(REGIONS); regions.village.exits.push('missing');
  assert.throws(() => validateRegions(regions), /exits/);
});

test('saved geometry survives a configured depth change and reload without rerolling', () => {
  const game = new Game(config, null, rng(5)), saved = structuredClone(game.state), previous = REGIONS.snow.depth;
  try {
    REGIONS.snow.depth = 12;
    const restored = new Game(config, structuredClone(saved), () => { throw Error('Saved maps must not reroll'); });
    assert.deepEqual(restored.state.maps, saved.maps);
    assert.equal(restored.snapshot().mapGraph.depth, 10);
    assert.equal(generateMap('snow', rng(5), mapDefinitions()).depth, 12);
  } finally { REGIONS.snow.depth = previous; }
});
