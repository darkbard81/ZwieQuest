import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Game} from '../src/game.js';
import {levelCombatBonus} from '../src/combat.js';
import {applyStatus,effectiveEnemy} from '../src/status-effects.js';
import {defenseTooltip} from '../public/labels.js';
const config=JSON.parse(readFileSync(new URL('../config.json',import.meta.url)));
const keys=['ACC','DEF','REF','FOR','WIL'];
const make=()=>{const g=new Game(config,null,()=>0);g.create({name:'레벨 검증',appearanceId:'warrior'});g.beginBattle();return g;};
test('level bonus applies once to only accuracy and four defenses, stacks with statuses, and leaves timing/damage unchanged',()=>{
 const g=make();applyStatus(g.state.battle,'hero','distracted',15000,{INT:0});const a=g.snapshot();
 for(const level of [1,2,3,4,5,10,11,40]){
  g.character.level=level;const b=g.snapshot();for(const key of keys)assert.equal(b.stats[key]-a.stats[key],3*Math.floor(level/2));
  for(const key of ['STR','CON','DEX','PER','INT','RES','PEN','AR','actionSpeed','actionIntervalMs'])assert.equal(b.stats[key],a.stats[key]);
  assert.deepEqual(b.attackDamage,a.attackDamage);
  for(const key of ['DEF','REF','FOR','WIL']){assert.equal(b.defenseBreakdown[key].levelBonus,levelCombatBonus(level));const text=defenseTooltip(key,b.defenseBreakdown[key]);if(level>1)assert.ok(text.includes(`레벨 보너스(${3*Math.floor(level/2)})`));assert.doesNotMatch(text,/레벨 보너스\([^)]*[×÷]/);}
 }
});
test('existing monsters and bestiary receive the missing bonus once with no battle or HP reset',()=>{
 const g=make();g.character.hp=1;g.command({type:'USE_SKILL',characterId:g.character.id,itemId:g.character.skillSlots[0],battleId:g.state.battle.id,heroActionSeq:0});
 const old=JSON.parse(JSON.stringify(g.state));old.enemy.level=7;delete old.enemy.levelBonusApplied;old.enemy.hp=17;
 const sample=Object.values(old.bestiary)[0].sample;sample.level=4;delete sample.levelBonusApplied;
 const h=new Game(config,structuredClone(old));for(const key of keys){assert.equal(h.state.enemy[key]-old.enemy[key],9);assert.equal(Object.values(h.state.bestiary)[0].sample[key]-sample[key],6);}
 assert.equal(h.state.enemy.hp,17);assert.deepEqual(h.state.battle,old.battle);assert.deepEqual(h.state.inventory,old.inventory);
 applyStatus(h.state.battle,'enemy','distracted',15000,{INT:0});const e=effectiveEnemy(h.state.enemy,h.state.battle,config);assert.equal(e.ACC,h.state.enemy.ACC-5);assert.equal(e.DEF,h.state.enemy.DEF-10);
 const restored=new Game(config,JSON.parse(JSON.stringify(h.state)));assert.deepEqual(restored.state,h.state);
});

test('previous per-level bonus is replaced by the new stepped bonus without stacking',()=>{
 const g=make(),old=JSON.parse(JSON.stringify(g.state));old.enemy.level=10;old.enemy.levelBonusApplied=27;
 const sample=Object.values(old.bestiary)[0].sample;sample.level=3;sample.levelBonusApplied=6;
 const h=new Game(config,structuredClone(old));for(const key of keys){assert.equal(h.state.enemy[key],old.enemy[key]-12);assert.equal(Object.values(h.state.bestiary)[0].sample[key],sample[key]-3);}
 assert.equal(h.state.enemy.levelBonusApplied,15);assert.equal(Object.values(h.state.bestiary)[0].sample.levelBonusApplied,3);
 assert.deepEqual(new Game(config,JSON.parse(JSON.stringify(h.state))).state,h.state);
});
