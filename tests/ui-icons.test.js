import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { uiIconHTML } from '../public/ui-icons.js';
import { damageNames, damageTagHTML } from '../public/damage-tags.js';
import { DAMAGE_NAMES } from '../src/equipment.js';
import { logHTML } from '../public/labels.js';

test('all supplied references have vector assets; absent stat references stay empty', () => {
  // Validate the shipped assets without requiring the local art workbench.
  const colors = { slash: '#DC2626', pierce: '#7C3AED', blunt: '#B45309', fire: '#EA580C', cold: '#2563EB', lightning: '#CA8A04', corrosion: '#16A34A', raw: '#6B7280' };
  const icons = [
    ...['LB', 'ACC', 'AR', 'DEF', 'REF', 'FOR', 'WIL', 'STR', 'CON', 'DEX', 'PER', 'INT', 'RES'].map(id => `stat-${id}`),
    ...Object.keys(colors).map(id => `damage-${id}`),
  ];
  const css = readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');
  assert.equal(icons.length, 21);
  for (const icon of icons) {
    const [group, id] = icon.split('-');
    assert.ok(uiIconHTML(group, id).includes(icon + '.svg'));
    const svg = readFileSync(new URL(`../public/assets/ui-icons/${icon}.svg`, import.meta.url), 'utf8');
    assert.match(svg, /<path /);
    assert.doesNotMatch(svg, /<image|data:image|<script|<foreignObject/);
    if (group === 'damage') assert.ok(css.includes(`.damage-${id}{--damage-color:${colors[id]}`));
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
