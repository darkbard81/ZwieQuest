import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../src/game.js';
import { stats } from '../src/combat.js';
import { generateEquipment } from '../src/equipment.js';
import { SKILL_CATALOG, validateSkillCatalog, initializeBattleSkills, maintainedSkillBonuses, useSkill, toggleSkill } from '../src/skills.js';
import { skillAvailability, skillDescription } from '../public/skills-view.js';
const config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url)));
const make = () => { const c=structuredClone(config); c.initiative.enemyDEX=-10; const g=new Game(c,null,()=>0); g.create({name: '모험가', appearanceId: 'wizard'});g.state.homePaused=false; g.state.risk=0; return g; };
const battle = g => {g.beginBattle();g.character.hp=1;g.state.enemy.hp=100000;g.state.enemy.weapon.damageMin=g.state.enemy.weapon.damageMax=0;};
const item = g => g.character.skills.find(i=>i.templateId==='heal');
const cmd = g => ({type:'USE_SKILL',characterId:g.character.id,itemId:item(g).id,battleId:g.state.battle.id,heroActionSeq:g.state.battle.combatants.hero.actionSeq});
const nextRound = g => { const seq=g.state.battle.combatants.hero.actionSeq; for(let n=0;g.state.battle.combatants.hero.actionSeq===seq && n<100;n++)g.tick(g.state.remaining,1); assert.ok(g.state.battle.combatants.hero.actionSeq>seq); };

test('independent context/mode/limit schema validates; dagger example is disabled and never granted',()=>{
 const heal=SKILL_CATALOG.skills.find(s=>s.id==='heal'),dagger=SKILL_CATALOG.skills.find(s=>s.id==='dagger-mastery');
 assert.deepEqual(heal.useContexts,['combat']);assert.equal(heal.activationMode,'direct');assert.equal(heal.perBattleLimit,2);
 assert.equal(dagger.enabled,false);assert.equal(dagger.grantOnCreate,false);assert.equal(dagger.perBattleLimit,null);assert.equal(dagger.activationMode,'toggle');assert.equal(dagger.toggleConsumesCycle,false);
 assert.deepEqual(make().character.skills.filter(i=>i.slot==='skill').map(i=>i.templateId),['heal']);
 for(const mutate of [c=>c.skills[0].useContexts=[],c=>c.skills[0].perBattleLimit=0,c=>c.skills[0].perBattleLimit=1.5,c=>c.skills[0].activationMode='auto',c=>c.skills[1].effect.weaponCategories=['unknown']]){const c=structuredClone(SKILL_CATALOG);mutate(c);assert.throws(()=>validateSkillCatalog(c));}
 const c=structuredClone(SKILL_CATALOG);c.skills[0].useContexts=['combat','nonCombat'];c.skills[0].perBattleLimit=null;assert.equal(validateSkillCatalog(c),c);
});
test('heal is accepted exactly twice per battle across cycles/reload/equip/copies; only a new battle resets the count',()=>{
 let g=make();battle(g);g.command(cmd(g));assert.equal(g.state.battle.skillUseCounts.heal,1);
 nextRound(g);assert.throws(()=>g.command(cmd(g)),/대기/);assert.equal(g.state.battle.skillUseCounts.heal,1);
 g.character.skillCooldowns.heal.readyAt=Date.now()-1;g.command(cmd(g));assert.equal(g.state.battle.skillUseCounts.heal,2);
 const view=g.snapshot().inventory.find(i=>i.slot==='skill');assert.equal(view.remainingUses,0);assert.equal(skillAvailability(g.snapshot(),view,Date.now()).kind,'exhausted');assert.match(skillDescription(view),/남은 0\/2회 · 소진/);
 const saved=structuredClone(g.state);g=new Game(g.config,saved,()=>0);nextRound(g);g.character.skillCooldowns.heal.readyAt=Date.now()-1;
 const copy={...item(g),id:'duplicate-heal'};g.character.skills.push(copy);g.command({characterId: g.character?.id, type:'UNEQUIP',itemId:item(g).id});g.command({characterId: g.character?.id, type:'EQUIP',itemId:copy.id});
 assert.throws(()=>g.command({characterId: g.character?.id, ...cmd(g),itemId:copy.id}),/소진/);assert.equal(g.state.battle.skillUseCounts.heal,2);
 const cooldown=structuredClone(g.character.skillCooldowns);g.beginBattle();assert.deepEqual(g.state.battle.skillUseCounts,{});assert.deepEqual(g.character.skillCooldowns,cooldown);g.command({characterId: g.character?.id, ...cmd(g),itemId:copy.id});assert.equal(g.state.battle.skillUseCounts.heal,1);
});
test('full HP, stale cycle, stale request, unequipped and cooldown rejections never consume battle uses',()=>{
 const g=make();battle(g);g.character.hp=stats(g.state,g.config).maxHp;assert.throws(()=>g.command(cmd(g)),/회복할 체력/);assert.deepEqual(g.state.battle.skillUseCounts,{});
 g.character.hp=1;assert.throws(()=>g.command({characterId: g.character?.id, ...cmd(g),heroActionSeq:-1}),/지났/);
 g.command({characterId: g.character?.id, type:'UNEQUIP',itemId:item(g).id});assert.throws(()=>g.command(cmd(g)),/장착/);assert.deepEqual(g.state.battle.skillUseCounts,{});
 g.command({characterId: g.character?.id, type:'EQUIP',itemId:item(g).id});g.command(cmd(g));nextRound(g);assert.throws(()=>g.command(cmd(g)),/대기/);assert.equal(g.state.battle.skillUseCounts.heal,1);
});
test('non-combat direct usage and unlimited battle usage are independently expressible without enabling either for heal',()=>{
 const c=structuredClone(SKILL_CATALOG);c.skills[0].useContexts=['nonCombat'];const g=make();g.character.hp=1;
 useSkill(g.state,item(g),stats(g.state,g.config),{itemId:item(g).id},100000,c);assert.ok(g.character.hp>1);assert.equal(g.state.battle,null);
 battle(g);assert.throws(()=>useSkill(g.state,item(g),stats(g.state,g.config),cmd(g),200000,c),/전투 외/);
 c.skills[0].useContexts=['combat'];c.skills[0].perBattleLimit=null;
 for(let n=0;n<3;n++){useSkill(g.state,item(g),stats(g.state,g.config),cmd(g),300000+n*30000,c);nextRound(g);}
 assert.equal(g.state.battle.skillUseCounts.heal,3);assert.equal(SKILL_CATALOG.skills[0].perBattleLimit,2);
});
test('legacy active battle restores previous successful heals from retained events; migrated counts never reset',()=>{
 const b={skillUsed:true},events=[{type:'battle'},{type:'skill',skillId:'heal'},{type:'battle'},{type:'hit'},{type:'skill',skillId:'heal'},{type:'skill',skillId:'heal'}];
 initializeBattleSkills(b,events);assert.equal(b.skillUseCounts.heal,2);initializeBattleSkills(b,[]);assert.equal(b.skillUseCounts.heal,2);
 const incomplete={};initializeBattleSkills(incomplete,[{type:'hit'}]);assert.equal(incomplete.skillUseCounts.heal,2);
 const fresh={};initializeBattleSkills(fresh,[{type:'battle'},{type:'hit'}]);assert.deepEqual(fresh.skillUseCounts,{});
});
test('dagger ON adds exactly one ACC, never percent or stacking; OFF/other weapon/end remove bonus and defenses stay unchanged',()=>{
 const def=SKILL_CATALOG.skills.find(s=>s.id==='dagger-mastery'),original=structuredClone(def);
 try {
  // Explicit test policy only; the shipped example remains disabled/unresolved.
  def.enabled=true;def.toggleConsumesCycle=false;
  const g=make(),skill={id:'dagger-skill',templateId:def.id,slot:'skill',stats:{},name:def.name};g.character.skills.push(skill);g.command({characterId: g.character?.id, type:'EQUIP',itemId:skill.id});
  const dagger=generateEquipment({slot:'weapon',templateId:'dagger',gradeId:'normal',specials:false,rng:()=>0});g.state.inventory.push(dagger);g.command({characterId: g.character?.id, type:'EQUIP',itemId:dagger.id});battle(g);
  const base=stats(g.state,g.config);const toggle=enabled=>g.command({characterId: g.character?.id, type:'TOGGLE_SKILL',itemId:skill.id,battleId:g.state.battle.id,heroActionSeq:g.state.battle.combatants.hero.actionSeq,enabled});
  assert.equal(g.snapshot().combatStats.ACC,base.ACC);toggle(true);assert.equal(g.snapshot().combatStats.ACC,base.ACC+1);toggle(true);assert.equal(g.state.battle.skillUseCounts[def.id],1);
  const duplicate={...skill,id:'copy'};g.character.skills.push(duplicate);g.character.skillSlots[2]=duplicate.id;
  for(let n=0;n<4;n++)assert.deepEqual(maintainedSkillBonuses(g.state),{ACC:1});assert.deepEqual(stats(g.state,g.config),base);
  for(const key of ['DEF','REF','FOR','WIL'])assert.equal(g.snapshot().combatStats[key],base[key]);
  g.battleAction('hero');assert.equal(g.state.battle.lastHit.calculation.acc,base.ACC+1);assert.equal(g.state.battle.lastHit.target,'REF');
  const reloaded=new Game(g.config,structuredClone(g.state));assert.equal(reloaded.snapshot().combatStats.ACC,base.ACC+1);
  toggle(false);assert.equal(g.snapshot().combatStats.ACC,base.ACC);toggle(true);
  const other=generateEquipment({slot:'weapon',templateId:'fire-staff',gradeId:'normal',specials:false,rng:()=>0});g.state.inventory.push(other);g.command({characterId: g.character?.id, type:'EQUIP',itemId:other.id});assert.equal(g.snapshot().combatStats.ACC,stats(g.state,g.config).ACC);
  g.battleAction('hero');assert.equal(g.state.battle.lastHit.calculation.acc,stats(g.state,g.config).ACC);assert.equal(g.state.battle.lastHit.target,'WIL');
  g.command({characterId: g.character?.id, type:'EQUIP',itemId:dagger.id});g.phase('TREASURE',1000);assert.deepEqual(maintainedSkillBonuses(g.state),{ACC:0});
  g.beginBattle();assert.deepEqual(g.state.battle.skillToggles,{});assert.equal(g.snapshot().combatStats.ACC,base.ACC);
 } finally {Object.assign(def,original);}
});
test('unresolved ON/OFF policy cannot execute; both explicit policies respect their chosen cycle lock without changing readiness',()=>{
 const g=make();battle(g);const c=structuredClone(SKILL_CATALOG),def=c.skills.find(s=>s.id==='dagger-mastery');def.enabled=true;
 const learned={id:'toggle-test',templateId:def.id,slot:'skill'};g.character.skills.push(learned);g.character.skillSlots[1]=learned.id;
 const command={...cmd(g),itemId:learned.id,enabled:true};def.toggleConsumesCycle=null;assert.throws(()=>toggleSkill(g.state,learned,stats(g.state,g.config),command,Date.now(),c),/정해지지/);
 for(const consumes of [true,false]){def.toggleConsumesCycle=consumes;g.state.battle.skillUsed=false;g.state.battle.skillToggles={};g.character.skillCooldowns={};const progress=structuredClone(g.state.battle.combatants);toggleSkill(g.state,learned,stats(g.state,g.config),command,Date.now(),c);assert.equal(g.state.battle.skillUsed,consumes);assert.deepEqual(g.state.battle.combatants,progress);}
});

test('approved toggle policy permits ON/OFF after a direct skill, without consuming or resetting its cycle lock',()=>{
 const g=make();battle(g);g.command(cmd(g));assert.equal(g.state.battle.skillUsed,true);
 const c=structuredClone(SKILL_CATALOG),def=c.skills.find(s=>s.id==='dagger-mastery');def.enabled=true;assert.equal(def.toggleConsumesCycle,false);
 const learned={id:'approved-toggle',templateId:def.id,slot:'skill'};g.character.skills.push(learned);g.character.skillSlots[1]=learned.id;
 const before={combatants:structuredClone(g.state.battle.combatants),remaining:g.state.remaining,healCount:g.state.battle.skillUseCounts.heal};
 for(const enabled of [true,false,true]){toggleSkill(g.state,learned,stats(g.state,g.config),{...cmd(g),itemId:learned.id,enabled},Date.now(),c);assert.equal(g.state.battle.skillUsed,true);}
 assert.deepEqual({combatants:structuredClone(g.state.battle.combatants),remaining:g.state.remaining,healCount:g.state.battle.skillUseCounts.heal},before);
 assert.throws(()=>g.command(cmd(g)),/이미/);
});
