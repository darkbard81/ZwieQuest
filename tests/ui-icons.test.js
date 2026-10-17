import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { uiIconHTML } from '../public/ui-icons.js';
import { damageNames, damageTagHTML } from '../public/damage-tags.js';
import { DAMAGE_NAMES } from '../src/equipment.js';
import { logHTML } from '../public/labels.js';

test('all supplied references have vector assets; absent stat references stay empty', () => {
  const manifest = JSON.parse(readFileSync(new URL('../art/ui-icons/manifest.json', import.meta.url)));
  const css = readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');
  assert.equal(manifest.length, 21);
  for (const item of manifest) {
    const [group, id] = item.id.split('-');
    assert.ok(uiIconHTML(group, id).includes(item.id + '.svg'));
    const svg = readFileSync(new URL(`../public/assets/ui-icons/${item.id}.svg`, import.meta.url), 'utf8');
    assert.match(svg, /<path /);
    assert.doesNotMatch(svg, /<image|data:image|<script|<foreignObject/);
    if (group === 'damage') assert.ok(css.includes(`.damage-${id}{--damage-color:${item.color}`));
  }
  for (const id of ['PEN', '<invalid>']) assert.equal(uiIconHTML('stat', id), '');
  assert.match(uiIconHTML('damage', 'slash'), /damage-slash.svg/);
});

test('server and UI share renamed damage types while canonical keys stay unchanged', () => {
  assert.deepEqual(damageNames, DAMAGE_NAMES);
  assert.deepEqual(Object.values(damageNames), ['베기', '관통', '부수기', '소각', '동결', '충격', '부식', '고정']);
  assert.match(damageTagHTML('fire'), /damage-fire.svg/);
  assert.match(damageTagHTML('fire'), /소각/);
});

test('old and new combat damage suffixes render new labels without renaming item names', () => {
  for (const name of ['화염', '소각']) {
    const html = logHTML(`화염 지팡이 · 12 피해 (${name} / AR 2)`);
    assert.ok(html.startsWith('화염 지팡이'));
    assert.match(html, /damage-fire.svg/);
    assert.match(html, /소각/);
  }
  assert.match(logHTML('3 피해 (Raw 고정)'), /damage-raw.svg/);
  assert.match(logHTML('3 피해 (고정 피해)'), /damage-raw.svg/);
});
