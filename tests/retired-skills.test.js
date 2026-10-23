import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Game} from '../src/game.js';
import {SKILL_CATALOG, skillDefinition, grantTreasureSkill, initializeSharedSkills} from '../src/skills.js';
import {applyStatus} from '../src/status-effects.js';
const config=JSON.parse(readFileSync(new URL('../config.json',import.meta.url)));
const retired=['purify','dispel'];
test('removed utilities cannot drop and saved shared/legacy ownership, slots and reservations are cleaned idempotently',()=>{
 for(const id of retired)assert.equal(skillDefinition(id),undefined);
 for(const shared of [true,false]){
  const g=new Game(config,null,()=>0);g.create({name:'A',appearanceId:'warrior'});g.create({name:'B',appearanceId:'warrior'});g.beginBattle();applyStatus(g.state.battle,'hero','hobbled',15000,{INT:0});
  const saved=JSON.parse(JSON.stringify(g.state)),before=structuredClone(saved);
  const items=retired.map(id=>({id:'old-'+id,templateId:id,name:id,slot:'skill',stats:{}}));
  if(shared)saved.sharedSkills.push(...items);else delete saved.sharedSkills;
  for(const c of saved.characters){c.skills.push(...structuredClone(items));c.skillSlots[2]=items[0].id;c.skillSlots[3]=items[1].id;c.skillToggles.purify=true;}
  saved.battle.pendingSkill={itemId:items[0].id,skillId:'purify',characterId:saved.activeCharacterId,battleId:saved.battle.id,heroActionSeq:0};
  saved.battle.skillUseCounts={heal:1,purify:1,dispel:1};
  const h=new Game(config,saved,()=>0);
  assert.ok(h.state.sharedSkills.every(i=>!retired.includes(i.templateId)));
  for(const c of h.state.characters){assert.equal(c.skillSlots[2],null);assert.equal(c.skillSlots[3],null);assert.equal(c.skillToggles.purify,undefined);}
  assert.equal(h.state.battle.pendingSkill,undefined);assert.deepEqual(h.state.battle.skillUseCounts,{heal:1});
  for(const key of ['statuses','combatants','id'])assert.deepEqual(h.state.battle[key],before.battle[key]);
  for(const key of ['inventory','maps','enemy'])assert.deepEqual(h.state[key],before[key]);
  assert.deepEqual(new Game(config,JSON.parse(JSON.stringify(h.state)),()=>0).state,h.state);
  const learned=[];for(let i=0;i<40;i++){const item=grantTreasureSkill(h.state,()=>0);if(item)learned.push(item.templateId);}
  assert.ok(learned.every(id=>!retired.includes(id)));assert.equal(learned.length,27);
 }
 const empty={characters:[],sharedSkills:[{id:'old',slot:'skill',templateId:'purify'}]};initializeSharedSkills(empty);assert.deepEqual(empty.sharedSkills,[]);
});
test('armor masteries grant only the approved defense or speed advantage; weapon masteries remain unchanged',()=>{
 const expected={cloth:[0,0,0,5],light:[0,.1,0,0],medium:[0,.15,0,0],heavy:[0,.2,0,0]};
 const armors=SKILL_CATALOG.skills.filter(s=>s.effect.equipmentSlot==='armor');assert.equal(armors.length,4);
 for(const {effect:e} of armors)assert.deepEqual([e.accuracyBonus,e.actionSpeedRate,e.damageRate,e.defenseBonus||0],expected[e.category]);
 assert.equal(SKILL_CATALOG.skills.filter(s=>s.enabled).length,28);
 assert.deepEqual(['accuracyBonus','actionSpeedRate','damageRate'].map(k=>skillDefinition('light-weapon-mastery').effect[k]),[2,.1,-.1]);
});
