import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { statDetails, stats } from '../src/combat.js';
import { Game } from '../src/game.js';
import { defenseTooltip, statLabelHTML, statNames, logHTML } from '../public/labels.js';
import { itemDetailsHTML } from '../public/equipment-view.js';
const config=JSON.parse(readFileSync(new URL('../config.json',import.meta.url)));
const keys=['DEF','REF','FOR','WIL'];
function hero(classId,level=1){return {classId,level,equipment:{armor:'armor',charm:'charm'},inventory:[{id:'armor',slot:'armor',stats:{DEX:-3,REF:2}},{id:'charm',slot:'charm',stats:{RES:2,STR:1,FOR:-1,WIL:1,DEF:2}}]};}

test('defense calculations retain their values and expose equipped attributes, direct bonuses and class mastery',()=>{
 for(const classId of ['warrior','wizard'])for(const level of [1,4,config.mastery.fromLevel-1,config.mastery.fromLevel,config.mastery.fromLevel+3]){
  const state=hero(classId,level),{values,defenses}=statDetails(state,config),cls=config.classes[classId],lb=Math.floor((level-1)/3);
  const expected={DEF:cls.B.DEF+cls.base.RES+2+lb+2,REF:cls.B.REF+cls.base.DEX-3+cls.base.PER+lb+2,FOR:cls.B.FOR+cls.base.STR+1+cls.base.CON+lb-1+(classId==='warrior'&&level>=config.mastery.fromLevel?config.mastery.warriorFOR:0),WIL:cls.B.WIL+cls.base.INT+cls.base.RES+2+lb+1+(classId==='wizard'&&level>=config.mastery.fromLevel?config.mastery.wizardWIL:0)};
  assert.deepEqual(stats(state,config),values);
  for(const key of keys){assert.equal(values[key],expected[key],`${classId}/${level}/${key}`);assert.equal(defenses[key].total,expected[key]);}
  assert.equal(defenses.REF.attributes[0].equipment,-3);
  assert.equal(defenses.DEF.attributes[0].value,cls.base.RES+2);
  assert.equal(defenses.DEF.equipment,2);
 }
});
test('tooltip uses the server breakdown, shows negative modifiers and distinguishes Resolve from Will',()=>{
 const detail=statDetails(hero('warrior'),config).defenses;
 const reflex=defenseTooltip('REF',detail.REF);
 assert.equal(reflex,'직업 기본값(1) + 민첩(-2) + 통찰(2) + 레벨 보너스(0) + 장비 보정(2) = 3');
 assert.equal(reflex.split('\n').length,1);
 assert.match(defenseTooltip('DEF',detail.DEF),/결의\(3\)/);
 assert.match(defenseTooltip('FOR',detail.FOR),/직업 숙련/);
 for(const key of keys)assert.doesNotMatch(defenseTooltip(key,detail[key]),/\b(DEF|FOR|REF|WIL|RES|DEX|STR|CON|PER|INT|Deflection|Fortitude|Reflex|Will)\b/);
 assert.match(statLabelHTML('DEF',9,'<formula> "safe"'),/title="&lt;formula&gt; &quot;safe&quot;"/);
 assert.equal(defenseTooltip('DEF',undefined),'');
});
test('four defense names are Korean throughout badges, item details and combat logs',()=>{
 assert.deepEqual(keys.map(k=>statNames[k]),['회피','반사','인내','의지']);
 for(const key of keys){
  const strip=html=>html.replace(/<[^>]+>/g,'');
  assert.equal(strip(statLabelHTML(key,7)),`${statNames[key]} 7`);
  assert.equal(strip(logHTML(`${key} 7`)),`${statNames[key]} 7`);
  assert.equal(strip(itemDetailsHTML({slot:'weapon',stats:{},hitDefense:key})),statNames[key]);
 }
});
test('snapshot formulas follow class switches and equipment changes without stale values',()=>{
 const g=new Game(config);g.create('warrior');g.state.level=config.mastery.fromLevel;
 let snapshot=g.snapshot();assert.equal(snapshot.defenseBreakdown.FOR.mastery.value,config.mastery.warriorFOR);
 const armor=g.state.equipment.armor;g.command({type:'UNEQUIP',itemId:armor});snapshot=g.snapshot();assert.equal(snapshot.defenseBreakdown.REF.attributes[0].equipment,0);
 g.command({type:'CLASS',classId:'wizard'});snapshot=g.snapshot();assert.equal(snapshot.defenseBreakdown.FOR.mastery,null);assert.equal(snapshot.defenseBreakdown.WIL.mastery.value,0);
 for(const key of keys)assert.equal(snapshot.defenseBreakdown[key].total,snapshot.stats[key]);
});
