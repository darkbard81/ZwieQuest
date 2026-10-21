import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../src/game.js';
import { stats } from '../src/combat.js';
import { actionSpeed, enemyActionSpeed, COMBAT_RULES_VERSION } from '../src/action-speed.js';
import { EQUIPMENT_CATALOG as catalog, generateEquipment, validateCatalog } from '../src/equipment.js';
import { itemDetailsHTML } from '../public/equipment-view.js';
const config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url)));
const expected = {dagger:[0,9,13],shortsword:[0,12,16],rapier:[0,12,16],longsword:[.05,14,18],spear:[.05,15,19],handaxe:[.1,14,18],mace:[.1,17,21],halberd:[.15,18,24],greatsword:[.2,22,29],battleaxe:[.2,20,26],warhammer:[.2,21,29],'fire-staff':[0,14,18],'ice-staff':[0,14,18],'lightning-staff':[0,14,18],'corrosion-staff':[0,14,18]};
const gear = (id, gradeId='normal', specials=false) => generateEquipment({slot:catalog.weapons.some(w=>w.id===id)?'weapon':'armor',templateId:id,gradeId,specials,rng:()=>0});
const make = (weapon='greatsword') => {
 const g=new Game(config,null,()=>0);g.create({name:'무기 속도 검증',appearanceId:'warrior'});
 const w=gear(weapon),a=gear('leather');g.state.inventory=[w,a];g.character.equipment={weapon:w.id,armor:a.id};
 g.character.attributes.CON=1000;g.character.hp=stats(g.state,config).maxHp;
 g.beginBattle();g.state.enemy.hp=g.state.enemy.maxHp=1e9;g.state.enemy.weapon.damageMin=g.state.enemy.weapon.damageMax=0;
 return g;
};
test('approved weapon ranges and category penalties apply to all grades and item details',()=>{
 for(const [id,[penalty,min,max]] of Object.entries(expected))for(const grade of catalog.grades){
  const w=gear(id,grade.id);assert.equal(w.actionSpeedPenaltyRate,penalty);assert.equal(w.damageMin,min);assert.equal(w.damageMax,max);
  assert.equal(w.damageRate,grade.damageRate);assert.equal(w.weaponBalanceRulesVersion,catalog.weaponBalanceRulesVersion);
  assert.match(itemDetailsHTML(w),new RegExp(`행동속도 -${penalty*100}%`));
 }
 for(const mutate of [c=>delete c.weapons[0].weaponCategory,c=>c.weapons[0].weaponCategory='unknown',c=>c.weaponCategories.heavy.actionSpeedPenaltyRate=.51,c=>c.weaponCategories.staff.actionSpeedPenaltyRate=NaN,c=>c.weapons[0].actionSpeedPenaltyRate=.2]){
  const c=structuredClone(catalog);mutate(c);assert.throws(()=>validateCatalog(c));
 }
});
test('armor and weapon speed multiply, with unchanged DEX and enemy timing and valid individual limits',()=>{
 const s=actionSpeed(0,.1,config,.2);assert.equal(s.actionSpeed,72);assert.ok(Math.abs(s.actionIntervalMs-2200/.72)<1e-9);
 assert.equal(s.armorSpeedPenaltyRate,.1);assert.equal(s.weaponSpeedPenaltyRate,.2);assert.ok(Math.abs(s.actionSpeedPenaltyRate-.28)<1e-9);
 assert.equal(actionSpeed(0,.5,config,.2).actionSpeed,40);
 for(const p of [-.1,.51,NaN,Infinity])assert.throws(()=>actionSpeed(0,.1,config,p));
 const g=make();assert.equal(stats(g.state,config).DEX,0);assert.equal(stats(g.state,config).actionSpeed,72);
 assert.equal(g.snapshot().battleTiming.hero.weaponSpeedPenaltyRate,.2);assert.equal(g.snapshot().battleTiming.hero.armorSpeedPenaltyRate,.1);
 for(let i=0;i<110;i++)g.tick(200);
 assert.equal(g.state.battle.combatants.hero.actionSeq,7);assert.equal(g.state.battle.combatants.enemy.actionSeq,10);
 const e={DEX:0,armor:{actionSpeedPenaltyRate:.1},weapon:{actionSpeedPenaltyRate:.2}};
 Object.assign(e,enemyActionSpeed(e,config));assert.equal(enemyActionSpeed(e,config).actionSpeed,72);
});
test('switching weapons during combat preserves readiness, DEX defenses and skill cooldowns',()=>{
 const g=make(),before=stats(g.state,config);g.tick(g.battleIntervals().hero/2);
 const readiness=g.state.battle.combatants.hero.readiness;g.state.battle.skillUsed=true;g.character.skillCooldowns.heal={readyAt:123456};
 const w=gear('dagger');g.state.inventory.push(w);g.command({type:'EQUIP',characterId:g.character.id,itemId:w.id});
 const after=stats(g.state,config);assert.equal(after.actionSpeed,90);assert.equal(after.DEX,before.DEX);assert.equal(after.REF,before.REF);
 assert.equal(g.state.battle.combatants.hero.readiness,readiness);assert.ok(Math.abs(g.snapshot().battleTiming.hero.nextActionMs-(1-readiness)*2200/.9)<1e-8);
 assert.equal(g.state.battle.skillUsed,true);assert.equal(g.character.skillCooldowns.heal.readyAt,123456);
});
test('old saved weapon balance migrates once without rerolling gear or resetting v5 battle progress',()=>{
 const g=make('warhammer');const special=gear('warhammer','legendary',true);
 g.state.inventory.push(special);g.character.equipment.weapon=special.id;g.refreshBattleTiming();g.tick(500);
 g.state.battle.rulesVersion=5;g.state.battle.skillUsed=true;g.state.battle.skillUseCounts={heal:1};g.character.skillCooldowns.heal={readyAt:123456};
 for(const w of g.state.inventory.filter(i=>i.slot==='weapon')){delete w.weaponBalanceRulesVersion;delete w.weaponCategory;delete w.actionSpeedPenaltyRate;w.damageMin=17;w.damageMax=23;}
 const old=structuredClone(g.state),before=structuredClone(special);
 const restored=new Game(config,structuredClone(old),()=>{throw Error('must not reroll');});
 const item=restored.state.inventory.find(i=>i.id===special.id);
 assert.deepEqual(item,{...before,weaponCategory:'heavy',actionSpeedPenaltyRate:.2,weaponBalanceRulesVersion:1,damageMin:21,damageMax:29});
 assert.equal(restored.character.equipment.weapon,item.id);assert.equal(restored.character.hp,old.characters[0].hp);
 assert.deepEqual(restored.state.battle,{...old.battle,rulesVersion:COMBAT_RULES_VERSION});assert.deepEqual(restored.character.skillCooldowns,{});
 assert.deepEqual(restored.state.enemy,old.enemy);
 const again=new Game(config,structuredClone(restored.state),()=>{throw Error('must not reroll');});assert.deepEqual(again.state,restored.state);
});
