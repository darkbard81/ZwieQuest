import test from 'node:test';
import assert from 'node:assert/strict';
import { desktopLayout } from '../public/viewport-layout.js';

test('tabbed information uses available height beside the fixed playfield', () => {
  for (const height of [422, 500, 600, 720, 1000]) {
    const result = desktopLayout(992, height);
    assert.equal(result.stacked, false);
    assert.equal(result.details, height);
    assert.equal(result.height, height);
    assert.equal('journal' in result, false);
  }
});

test('stacked viewports fit the playfield to their width at 4:3 while wide layout stays fixed', () => {
  assert.equal(desktopLayout(992, 300).height, 422);
  for (const width of [358, 700, 805]) {
    const result = desktopLayout(width, 600);
    assert.equal(result.stacked, true);
    assert.equal(result.worldWidth, width);
    assert.equal(result.worldScale, (width-2)/512);
    assert.equal(result.worldHeight, 38+(width-2)*3/4);
    assert.equal(result.height, result.worldHeight + 12 + result.details);
    assert.ok(result.details >= 422);
  }
  assert.equal(desktopLayout(806, 600).stacked, false);
});

test('separate combat controls fit below the fixed or scaled playfield', () => {
  const wide = desktopLayout(992, 450, 80);
  assert.equal(wide.height, 422 + 12 + 80);
  assert.equal(wide.details, wide.height);
  const stacked = desktopLayout(700, 600, 80);
  assert.equal(stacked.height, stacked.worldHeight + 12 + 80 + 12 + stacked.details);
  assert.equal(wide.worldWidth,514);assert.equal(wide.worldHeight,422);assert.equal(wide.worldScale,1);
});
