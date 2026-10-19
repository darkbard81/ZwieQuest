import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { statDetails } from '../src/combat.js';
import { Game } from '../src/game.js';
import { defenseTooltip, statLabelHTML, statNames, logHTML } from '../public/labels.js';
import { itemDetailsHTML } from '../public/equipment-view.js';
const config=JSON.parse(readFileSync(new URL('../config.json',import.meta.url)));
const keys=['DEF','REF','FOR','WIL'];
function make(level=1){const g=new Game(config);g.create({name:'테스트',appearanceId:'warrior'});g.character.level=level;g.character.equipment={armor:'armor',charm:'charm'};g.state.inventory=[{id:'armor',slot:'armor',stats:{DEX:-3,REF:2}},{id:'charm',slot:'charm',stats:{RES:2,STR:1,FOR:-1,WIL:1,DEF:2}}];return g;}
test('defense breakdown uses common base 10, invested/equipped attributes, direct bonuses and level bonus without mastery',()=>{
 for(const level of [1,4,9,10,13]){const g=make(level),{values,defenses}=statDetails(g.state,config),lb=Math.floor((level-1)/3);const expected={DEF:14+lb,REF:9+lb,FOR:10+lb,WIL:13+lb};for(const k of keys){assert.equal(values[k],expected[k]);assert.equal(defenses[k].total,expected[k]);assert.equal(defenses[k].mastery,null);}assert.equal(defenses.REF.attributes[0].equipment,-3);}
});
test('tooltip uses server breakdown and keeps negative modifiers and Korean stat names',()=>{
 const g=make(),detail=statDetails(g.state,config).defenses;assert.equal(defenseTooltip('REF',detail.REF),'기본값(10) + 민첩(-3) + 통찰(0) + 레벨 보너스(0) + 장비 보정(2) = 9');assert.match(defenseTooltip('DEF',detail.DEF),/결의\(2\)/);assert.doesNotMatch(defenseTooltip('FOR',detail.FOR),/직업/);assert.match(statLabelHTML('DEF',9,'<formula> "safe"'),/title="&lt;formula&gt; &quot;safe&quot;"/);assert.equal(defenseTooltip('DEF',undefined),'');
});
test('four defense names remain Korean in badges, item details and logs',()=>{
 assert.deepEqual(keys.map(k=>statNames[k]),['회피','반사','인내','의지']);for(const key of keys){const strip=html=>html.replace(/<[^>]+>/g,'');assert.equal(strip(statLabelHTML(key,7)),`${statNames[key]} 7`);assert.equal(strip(logHTML(`${key} 7`)),`${statNames[key]} 7`);assert.equal(strip(itemDetailsHTML({slot:'weapon',stats:{},hitDefense:key})),statNames[key]);}
});
test('snapshot defenses immediately track equipment and attribute allocation',()=>{
 const g=make(10);g.command({type:'UNEQUIP',characterId:g.character.id,itemId:'armor'});assert.equal(g.snapshot().defenseBreakdown.REF.attributes[0].equipment,0);g.command({type:'ALLOCATE_STAT',characterId:g.character.id,stat:'DEX'});assert.equal(g.snapshot().stats.REF,14);for(const key of keys)assert.equal(g.snapshot().defenseBreakdown[key].total,g.snapshot().stats[key]);
});
