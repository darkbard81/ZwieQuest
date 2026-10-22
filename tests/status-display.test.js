import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../src/game.js';
import { applyStatus, resolveStatusEvents } from '../src/status-effects.js';
import { combatStatDisplay, attributeValueHTML } from '../public/labels.js';
const config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url)));
const make = () => { const g = new Game(config,null,()=>0);g.create({name:'표시 확인',appearanceId:'warrior'});g.beginBattle();return g; };

test('speed display truncates without altering precise speed or interval', () => {
  const g = make();g.character.attributes.DEX=7;
  g.state.inventory.push({id:'display-armor',slot:'armor',stats:{},actionSpeedPenaltyRate:.15});g.character.equipment.armor='display-armor';
  const before=structuredClone(g.state),s=g.snapshot();
  assert.notEqual(s.stats.actionSpeed,Math.trunc(s.stats.actionSpeed));
  assert.equal(combatStatDisplay('actionSpeed',s.stats.actionSpeed),Math.trunc(s.stats.actionSpeed));
  assert.equal(combatStatDisplay('actionSpeed',99.9999),99);
  assert.equal(combatStatDisplay('PEN',3.456),3.46);
  assert.deepEqual(g.state,before);
  assert.equal(g.snapshot().stats.actionSpeed,s.stats.actionSpeed);
  assert.equal(g.snapshot().stats.actionIntervalMs,s.stats.actionIntervalMs);
});
test('all six temporary attribute bonuses remain separate from permanent equipment and reset on cancellation/expiry', () => {
  const keys=['STR','CON','DEX','PER','INT','RES'];
  const buffs=['strong','fit','quick','insightful','smart','steadfast'];
  const debuffs=['staggered','sickened','hobbled','distracted','confused','shaken'];
  for(const [i,key] of keys.entries()) {
    const g=make();g.character.attributes[key]=2;
    g.state.inventory.push({id:'display-charm',slot:'charm',stats:{[key]:10}});g.character.equipment.charm='display-charm';
    const original=g.snapshot();const base=original.attributeBreakdown[key];
    assert.deepEqual(base,{base:2,equipment:10,status:0,total:12});
    assert.doesNotMatch(attributeValueHTML(original.stats[key],base),/data-polarity="(?:buff|debuff)"/);
    applyStatus(g.state.battle,'hero',buffs[i],1000,{INT:0});
    let s=g.snapshot();assert.deepEqual(s.attributeBreakdown[key],{...base,status:5,total:17});
    assert.match(attributeValueHTML(s.stats[key],s.attributeBreakdown[key]),/data-polarity="buff"/);
    assert.match(attributeValueHTML(s.stats[key],s.attributeBreakdown[key]),/\(\+5\)/);
    applyStatus(g.state.battle,'hero',debuffs[i],1000,{INT:0});
    assert.deepEqual(g.snapshot().attributeBreakdown[key],base);
    applyStatus(g.state.battle,'hero',debuffs[i],1000,{INT:0});s=g.snapshot();
    assert.equal(s.stats[key],7);assert.equal(s.attributeBreakdown[key].status,-5);
    const html=attributeValueHTML(s.stats[key],s.attributeBreakdown[key]);assert.match(html,/data-polarity="debuff"/);assert.match(html,/\(-5\)/);assert.match(html,/장비 \+10 · 상태 -5/);
    g.state.battle.statuses.hero.forEach(effect=>effect.remainingMs=0);resolveStatusEvents(g.state.battle);
    assert.deepEqual(g.snapshot().attributeBreakdown[key],base);
    applyStatus(g.state.battle,'hero',buffs[i],1000,{INT:0});g.finish(false);
    assert.deepEqual(g.snapshot().attributeBreakdown[key],base);
  }
});
test('color follows the temporary delta, not the final value or equipment sign', () => {
  assert.match(attributeValueHTML(-5,{base:0,equipment:-10,status:5}),/data-polarity="buff"/);
  assert.match(attributeValueHTML(20,{base:15,equipment:10,status:-5}),/data-polarity="debuff"/);
  assert.doesNotMatch(attributeValueHTML(-10,{base:0,equipment:-10,status:0}),/attribute-status-delta/);
  assert.doesNotMatch(attributeValueHTML(0),/data-polarity="(?:buff|debuff)"/);
  const g=new Game(config);assert.deepEqual(g.snapshot().attributeBreakdown,{});
});

test('normal attack range reflects strength, weapon grade and mastery without consuming combat state', () => {
  const g=make();const weapon=g.state.inventory.find(i=>i.id===g.character.equipment.weapon);
  weapon.damageMin=10;weapon.damageMax=20;weapon.damageRate=.25;g.character.attributes.STR=4;
  assert.deepEqual(g.snapshot().attackDamage,{min:15,max:30});
  const mastery={id:'range-mastery',templateId:'light-weapon-mastery',slot:'skill',stats:{}};
  g.character.skills.push(mastery);g.character.skillSlots[1]=mastery.id;g.character.skillToggles[mastery.templateId]=true;
  const before=structuredClone(g.state);
  assert.deepEqual(g.snapshot().attackDamage,{min:13,max:27});assert.deepEqual(g.state,before);
  applyStatus(g.state.battle,'hero','staggered',10000,{INT:0});
  assert.deepEqual(g.snapshot().attackDamage,{min:10,max:21});
  g.character.skillToggles[mastery.templateId]=false;
  assert.deepEqual(g.snapshot().attackDamage,{min:11,max:23});
  g.character.equipment.weapon=null;
  assert.deepEqual(g.snapshot().attackDamage,{min:0,max:0});
});
test('fixed damage, unarmed, legacy and empty character ranges remain defined', () => {
  const g=make(),weapon=g.state.inventory.find(i=>i.id===g.character.equipment.weapon);
  weapon.damageTypes=['raw'];weapon.fixedDamage=17;g.character.attributes.STR=100;
  assert.deepEqual(g.snapshot().attackDamage,{min:17,max:17});
  delete weapon.damageTypes;weapon.icon='staff';weapon.stats.power=3;
  assert.deepEqual(g.snapshot().attackDamage,{min:138,max:138});
  g.character.equipment.weapon=null;g.character.attributes.STR=0;
  assert.deepEqual(g.snapshot().attackDamage,{min:1,max:1});
  assert.deepEqual(new Game(config).snapshot().attackDamage,{min:0,max:0});
});
