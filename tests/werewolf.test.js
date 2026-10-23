import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MONSTER_CATALOG, ENCOUNTER_CONFIG, eligibleVariations, eligibleBossVariations, generateMonster, recordMonsterEncounter, sortedBestiaryEntries } from '../src/monsters.js';
import { Game } from '../src/game.js';
import { modifiers } from '../src/status-effects.js';
import { losslessWebpInfo } from './helpers/webp.js';
const config=JSON.parse(readFileSync(new URL('../config.json',import.meta.url)));
const pool=eligibleVariations('old_forest');
const wolves=pool.filter(p=>p.monster.id==='werewolf');
const spawn=(id,level=0)=>{let draw=0;return generateMonster('old_forest',()=>[pool.findIndex(p=>p.variation.id===id),level,0][draw++]??0);};
test('seven Werewolf variants use strength/perception, 10–20 base weapon damage and forest-only encounters',()=>{
 assert.equal(wolves.length,7);
 assert.deepEqual(wolves.map(p=>p.variation.weapon.damageTypes[0]),['slash','pierce','blunt','fire','cold','lightning','corrosion']);
 const arachne=MONSTER_CATALOG.find(m=>m.id==='arachne');
 for(const {monster,variation} of wolves){
  assert.equal(monster.codexOrder,60);assert.equal(monster.A.STR,6);assert.equal(monster.A.PER,6);
  assert.ok(monster.A.STR>arachne.A.STR);assert.ok(monster.A.PER>arachne.A.PER);assert.ok(monster.A.DEX<arachne.A.DEX);
  for(const offset of [0,15]){
   const e=spawn(variation.id,offset);assert.equal(e.monsterId,'werewolf');assert.equal(e.level,5+offset);
   assert.equal(e.PER,6);assert.equal(e.DEX,2);assert.equal(e.CON,3);assert.deepEqual(e.skills,['weakening-strike']);
   assert.equal(e.weapon.damageMin,10);assert.equal(e.weapon.damageMax,20);assert.equal(e.weapon.hitDefense,'DEF');
  }
  for(const [path,size] of [[variation.img_path,512],[variation.icon_path,128]]){
   const info=losslessWebpInfo(readFileSync(new URL('../'+path,import.meta.url)));assert.deepEqual([info.width,info.height],[size,size]);assert.equal(info.alpha,true);
  }
 }
 for(const id of Object.keys(ENCOUNTER_CONFIG.regions).filter(id=>id!=='old_forest'))assert.ok(eligibleVariations(id).every(p=>p.monster.id!=='werewolf'));
 assert.deepEqual(eligibleBossVariations('old_forest').map(p=>p.variation.id),['corrosion_arachne']);
});
test('Werewolf is recorded in bestiary and its full encounter survives reload without rerolling',()=>{
 const g=new Game(config,null,()=>0);g.create({name:'늑대 저장 테스트',appearanceId:'warrior'});g.enterRegion('old_forest');g.beginBattle();
 g.state.enemy=spawn('slash_werewolf');recordMonsterEncounter(g.state,g.state.enemy);
 const saved=structuredClone(g.state);const restored=new Game(config,structuredClone(saved),()=>{throw Error('reroll');});
 assert.deepEqual(restored.state.enemy,saved.enemy);assert.deepEqual(restored.state.bestiary,saved.bestiary);
 assert.deepEqual(sortedBestiaryEntries({slash_werewolf:{},slash_arachne:{},slash_slime:{}}).map(([id])=>id),['slash_slime','slash_arachne','slash_werewolf']);
});
test('Werewolf attack skill checks FOR and weakens CON once per battle',()=>{
 const g=new Game(config,null,()=>0);g.create({name:'늑대 스킬 테스트',appearanceId:'warrior'});g.enterRegion('old_forest');g.beginBattle();
 g.state.enemy=spawn('slash_werewolf');g.character.hp=100000;g.character.attributes.RES=0;
 g.state.enemy.ACC=1000;g.state.battle.combatants.enemy.actionSeq=2;g.rng=n=>n===20?19:0;g.battleAction('enemy');
 assert.equal(g.state.battle.lastHit.statusCheck.target,'FOR');assert.equal(g.state.battle.lastHit.statusResult.applied,true);
 assert.equal(g.state.battle.enemySkillUseCounts['weakening-strike'],1);
 assert.equal(modifiers(g.state.battle,'hero').CON,-5);assert.equal(modifiers(g.state.battle,'hero').healingReceived,.5);
 g.battleAction('enemy');assert.equal(g.state.battle.enemySkillUseCounts['weakening-strike'],1);
});
