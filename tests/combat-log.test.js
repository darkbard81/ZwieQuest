import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { attack } from '../src/combat.js';
import { Game } from '../src/game.js';
import { combatLogHTML } from '../public/combat-log.js';
const input = { roll: 14, acc: 5, defense: 8, str: 0, base: 24, pen: 4, ar: 5, damageTypes: ['slash'] };
const entry = hit => ({ type: 'hit', text: 'old text', hit: { ...hit, attackerName: '모험가', defenderName: '이끼 슬라임', target: 'DEF' } });
const text = html => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');

test('combat explanation uses recorded accuracy, selected defense and exact damage factors', () => {
  const result = attack(input);
  assert.equal(result.damage, 18);
  assert.deepEqual(result.calculation, { acc: 5, defense: 8, fixedDamage: null, factors: { grade: 1, tactic: 1, strength: 1, hit: 1, armor: .75 } });
  for (const [target, name] of [['DEF', '회피'], ['REF', '반사'], ['FOR', '인내'], ['WIL', '의지']]) {
    const record = entry(result); record.hit.target = target;
    const html = combatLogHTML(record), plain = text(html);
    assert.match(plain, /모험가 → 이끼 슬라임 · 명중! 베기 피해 18/);
    assert.match(html, /class="combat-calculation combat-accuracy"/);
    assert.match(html, /class="combat-calculation combat-damage"/);
    assert.ok(plain.includes(`명중 5 + 🎲 14 vs ${name} 8 + 기준 10 → 명중`));
    assert.match(plain, /관통력 4 vs 방어도 5 = 기본 피해 24 × 배율 75% = 피해 18/);
    assert.match(html, /combat-calculation/); assert.match(html, /combat-value-tag/);
  }
  const enhanced = attack({ ...input, str: 3, damageRate: .3, tacticDamageRate: .5, roll: 20 });
  const f = enhanced.calculation.factors;
  assert.equal(enhanced.damage, Math.floor(enhanced.base * f.grade * f.tactic * f.strength * f.hit * f.armor));
  const html = combatLogHTML(entry(enhanced));
  for (const term of ['등급 130%', '전술 150%', '힘 115%', '치명타 150%', '자연 20 · 판정 ↑']) assert.ok(html.includes(term));
  assert.match(text(html), /배율 252.28125%/);
});

test('miss, graze, natural-one downgrade and fixed damage are not described as ordinary armor damage', () => {
  const miss = attack({ ...input, roll: 1 });
  assert.match(text(combatLogHTML(entry(miss))), /→ 미스/);
  assert.match(text(combatLogHTML(entry(miss))), /미스! 베기 피해 0/);
  assert.match(text(combatLogHTML(entry(miss))), /= 피해 0/);
  assert.match(text(combatLogHTML(entry(miss))), /자연 1 · 판정 ↓/);
  const graze = attack({ ...input, roll: 8 });
  assert.match(combatLogHTML(entry(graze)), /스침 50%/);
  for (const roll of [1, 8, 14, 20]) {
    const raw = attack({ ...input, roll, damageTypes: ['raw'], fixedDamage: 17 });
    const plain = text(combatLogHTML(entry(raw)));
    assert.equal(raw.damage, roll === 1 ? 0 : 17);
    assert.match(plain, /고정 17 · 방어도 무시/);
    assert.doesNotMatch(plain, /관통력|방어 보정|기본 피해|150%|50%/);
  }
  assert.equal(combatLogHTML({ text: '<이전 기록>' }), '&lt;이전 기록&gt;');
  const unsafe = entry(attack(input)); unsafe.hit.defenderName = '<img src=x onerror=alert(1)>';
  assert.match(combatLogHTML(unsafe), /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('real hero and enemy attacks persist original combat explanation across reload', () => {
  const config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url)));
  const game = new Game(config, null, () => 11); game.create({name: '모험가', appearanceId: 'warrior'});game.state.homePaused=false; game.advance();
  game.state.risk = 0; game.beginBattle(); game.character.hp = game.state.enemy.hp = 10000;
  const enemy = game.state.enemy.name;
  for (const actor of ['hero', 'enemy']) {
    game.battleAction(actor);
    const record = game.events.at(-1);
    assert.equal(record.type, 'hit');
    assert.equal(record.hit.attackerName, actor === 'hero' ? '모험가' : enemy);
    assert.equal(record.hit.defenderName, actor === 'hero' ? enemy : '모험가');
    const restored = new Game(config, JSON.parse(JSON.stringify(game.state)));
    assert.deepEqual(restored.state.battle.lastHit, record.hit);
    assert.ok(Number.isFinite(record.hit.calculation.acc));
  }
});
