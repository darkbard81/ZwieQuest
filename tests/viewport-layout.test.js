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

test('small viewports scroll without scaling the fixed playfield', () => {
  assert.equal(desktopLayout(992, 300).height, 422);
  for (const width of [358, 700, 805]) {
    const result = desktopLayout(width, 600);
    assert.equal(result.stacked, true);
    assert.equal(result.height, 422 + 12 + result.details);
    assert.ok(result.details >= 422);
  }
  assert.equal(desktopLayout(806, 600).stacked, false);
});

test('separate combat controls fit below the unchanged playfield in both layouts', () => {
  const wide = desktopLayout(992, 450, 80);
  assert.equal(wide.height, 422 + 12 + 80);
  assert.equal(wide.details, wide.height);
  const stacked = desktopLayout(700, 600, 80);
  assert.equal(stacked.height, 422 + 12 + 80 + 12 + stacked.details);
});
