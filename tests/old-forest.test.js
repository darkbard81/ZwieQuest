import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../src/game.js';
import { REGIONS } from '../src/regions.js';
import { eligibleVariations, eligibleBossVariations, generateMonster, MONSTER_CATALOG, ENCOUNTER_CONFIG, validateMonsters } from '../src/monsters.js';
import { modifiers } from '../src/status-effects.js';
const config=JSON.parse(readFileSync(new URL('../config.json',import.meta.url)));
test('old forest is reachable, unlocks an inn start and supplies seven stronger arachne variations',()=>{
 const g=new Game(config,null,()=>0);g.create({name:'숲 테스트',appearanceId:'warrior'});
 assert.equal(REGIONS.old_forest.depth,10);
 assert.deepEqual([REGIONS.old_forest.minLevel,REGIONS.old_forest.maxLevel],[10,15]);
 assert.equal(Object.values(g.state.maps.village.nodes).filter(n=>n.kind==='exit'&&n.region==='old_forest').length,1);
 g.enterRegion('old_forest');assert.ok(g.snapshot().availableStarts.some(s=>s.label==='오래된 숲 (레벨: 10~15)'));
 const pool=eligibleVariations('old_forest'),arachnes=pool.filter(p=>p.monster.id==='arachne');assert.equal(arachnes.length,7);
 for(const {monster,variation} of arachnes){
  assert.ok(monster.A.DEX>MONSTER_CATALOG.find(m=>m.id==='harpy').A.DEX);
  for(const level of [0,5]){let draw=0;const e=generateMonster('old_forest',()=>[pool.indexOf(arachnes.find(p=>p.variation===variation)),level,0][draw++]??0);
   assert.equal(e.monsterId,'arachne');assert.equal(e.level,10+level);assert.equal(e.DEX,6);assert.equal(e.CON,3);assert.equal(e.AR,4);assert.deepEqual(e.skills,['binding-strike']);
  }
 }
 for(const id of ['village','volcano','snow','desert','beach'])assert.ok(eligibleVariations(id).every(p=>p.monster.id!=='arachne'));
 assert.deepEqual(eligibleBossVariations('old_forest').map(p=>p.variation.id),['corrosion_arachne']);
 const invalid=structuredClone(ENCOUNTER_CONFIG);invalid.regions.old_forest.bossMonsterId='missing';assert.throws(()=>validateMonsters(MONSTER_CATALOG,invalid),/Invalid regional boss/);
});
test('existing account gains forest without losing nodes, edges, battle or exploration; reload is idempotent',()=>{
 const g=new Game(config,null,()=>0);g.create({name:'보존 테스트',appearanceId:'warrior'});g.beginBattle();
 const s=structuredClone(g.state);delete s.maps.old_forest;
 const exit=Object.values(s.maps.village.nodes).find(n=>n.region==='old_forest');exit.kind='deadend';exit.label='마을 막다른 길 6';delete exit.region;
 const replacedId=s.maps.village.terminalIds.find(id=>s.maps.village.nodes[id].kind==='deadend');
 const saved=structuredClone(s);const restored=new Game(config,s,()=>0);
 for(const [id,map] of Object.entries(saved.maps)){
  assert.deepEqual(Object.keys(restored.state.maps[id].nodes),Object.keys(map.nodes));
  for(const [nodeId,node] of Object.entries(map.nodes)){
   if(nodeId===replacedId)assert.deepEqual(restored.state.maps[id].nodes[nodeId],{...node,kind:'exit',region:'old_forest',label:'오래된 숲 연결'});
   else assert.deepEqual(restored.state.maps[id].nodes[nodeId],node);
  }
 }
 for(const key of ['enemy','battle','characters','inventory','currentNodeId','path','checkpointHistory'])assert.deepEqual(restored.state[key],saved[key],key);
 for(const [id,known] of Object.entries(saved.exploredNodes))assert.deepEqual(restored.state.exploredNodes[id],known);
 const again=new Game(config,structuredClone(restored.state),()=>{throw Error('should not regenerate');});assert.deepEqual(again.state,restored.state);
});
test('arachne executes its attack skill and applies the DEX debuff through the combat engine',()=>{
 const g=new Game(config,null,()=>0);g.create({name:'스킬 테스트',appearanceId:'warrior'});g.enterRegion('old_forest');g.beginBattle(true);
 assert.equal(g.state.enemy.monsterId,'arachne');g.character.hp=100000;g.character.attributes.RES=0;
 g.state.enemy.ACC=1000;g.state.enemy.weapon.damageMin=0;g.state.enemy.weapon.damageMax=0;
 g.state.battle.combatants.enemy.actionSeq=2;g.rng=n=>n===20?19:0;g.battleAction('enemy');
 assert.equal(g.state.battle.enemySkillUseCounts['binding-strike'],1);
 assert.equal(g.state.battle.lastHit.statusCheck.target,'REF');assert.equal(modifiers(g.state.battle,'hero').DEX,-5);
 const count=g.state.battle.enemySkillUseCounts['binding-strike'];g.battleAction('enemy');assert.equal(g.state.battle.enemySkillUseCounts['binding-strike'],count);
});
