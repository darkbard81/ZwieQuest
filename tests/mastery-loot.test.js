import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {Game} from '../src/game.js';
import {stats,attack} from '../src/combat.js';
import {generateEquipment,EQUIPMENT_CATALOG} from '../src/equipment.js';
import {SKILL_CATALOG,maintainedSkillBonuses,validateSkillCatalog} from '../src/skills.js';
import {DEFAULT_PROBABILITIES,DROP_WEIGHTS,ProbabilitySettings,validateProbabilities,rollDropSlot} from '../src/probabilities.js';
import {defenseTooltip} from '../public/labels.js';
import {skillDescription,skillAvailability} from '../public/skills-view.js';
const config=JSON.parse(readFileSync(new URL('../config.json',import.meta.url)));
const masteries=SKILL_CATALOG.skills.filter(d=>d.effect.type==='equipmentMastery');
function make(){const g=new Game(structuredClone(config),null,()=>0);g.create({name:'숙련 검수',appearanceId:'warrior'});g.beginBattle();g.state.enemy.hp=g.state.enemy.maxHp=1e8;g.state.enemy.skills=[];g.state.enemy.DEX=-100;return g;}
function equip(g,slot,category){const def=(slot==='weapon'?EQUIPMENT_CATALOG.weapons:EQUIPMENT_CATALOG.armors).find(d=>d[slot+'Category']===category),item=generateEquipment({slot,templateId:def.id,gradeId:'normal',specials:false,rng:()=>0});g.state.inventory.push(item);g.character.equipment[slot]=item.id;return item;}
function learn(g,d,index=1){const item={id:d.id,templateId:d.id,slot:'skill',name:d.name,stats:{}};g.character.skills.push(item);g.character.skillSlots[index]=item.id;return item;}
function toggle(g,item,enabled=true){g.command({type:'TOGGLE_SKILL',characterId:g.character.id,itemId:item.id,battleId:g.state.phase==='BATTLE'?g.state.battle.id:null,heroActionSeq:g.state.phase==='BATTLE'?g.state.battle.combatants.hero.actionSeq:null,enabled});}
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} ~= ${b}`);
test('all 12 mastery categories apply exact bonuses, match equipment, preserve progress, and restore without stacking',()=>{
 assert.equal(masteries.length,12);assert.equal(new Set(masteries.map(d=>d.effect.equipmentSlot+':'+d.effect.category)).size,12);
 for(const d of masteries){const g=make(),e=d.effect;equip(g,e.equipmentSlot,e.category);const item=learn(g,d),base=stats(g.state,g.config);g.state.battle.combatants.hero.readiness=.4;toggle(g,item);
  assert.equal(g.state.battle.combatants.hero.readiness,.4);assert.equal(g.state.battle.skillUsed,false);assert.equal(g.state.battle.pendingSkill,undefined);
  for(let i=0;i<3;i++){toggle(g,item);const v=g.snapshot();assert.equal(v.combatStats.ACC,base.ACC+e.accuracyBonus);assert.equal(v.stats.DEF,base.DEF+(e.defenseBonus||0));assert.equal(v.defenseBreakdown.DEF.total,v.stats.DEF);close(v.combatStats.actionSpeed,base.actionSpeed*(1+e.actionSpeedRate));close(v.stats.actionIntervalMs,base.actionIntervalMs/(1+e.actionSpeedRate));assert.equal(v.inventory.find(i=>i.id===item.id).masteryMatches,true);assert.doesNotMatch(skillDescription(v.inventory.find(i=>i.id===item.id)),/undefined/);}
  assert.equal(g.state.battle.skillUseCounts[d.id],1);
  const restored=new Game(g.config,JSON.parse(JSON.stringify(g.state)),()=>0);assert.deepEqual(restored.snapshot().combatStats,g.snapshot().combatStats);
  toggle(g,item,false);assert.deepEqual(stats(g.state,g.config),base);assert.equal(g.snapshot().combatStats.ACC,base.ACC);
  toggle(g,item);delete g.character.equipment[e.equipmentSlot];assert.deepEqual(maintainedSkillBonuses(g.state),{ACC:0});assert.equal(g.snapshot().inventory.find(i=>i.id===item.id).masteryMatches,false);
  g.beginBattle();assert.deepEqual(g.state.battle.skillToggles,{});
 }
});
test('weapon/armor mastery sums rates; actual attacks record mastery separately, skill damage multiplies, raw stays fixed',()=>{
 const g=make();equip(g,'weapon','light');equip(g,'armor','light');const defs=['light-weapon-mastery','light-armor-mastery'].map(id=>masteries.find(d=>d.id===id));const before=stats(g.state,g.config);defs.forEach((d,i)=>toggle(g,learn(g,d,i+1)));
 const bonus=maintainedSkillBonuses(g.state);assert.equal(bonus.ACC,2);close(bonus.actionSpeedRate,.2);close(bonus.damageRate,-.1);close(stats(g.state,g.config).actionSpeed,before.actionSpeed*1.2);
 g.rng=n=>n-1;g.battleAction('hero');const hit=g.state.battle.lastHit;assert.equal(hit.calculation.acc,before.ACC+2);close(hit.calculation.factors.mastery,.9);
 const x={roll:15,acc:10,defense:10,str:0,base:100,pen:0,ar:0,skillDamageMultiplier:1.25,masteryDamageRate:-.2};assert.equal(attack(x).damage,100);assert.equal(attack({...x,damageTypes:['raw'],fixedDamage:17}).damage,17);
 g.character.hp=0;assert.deepEqual(maintainedSkillBonuses(g.state),{ACC:0});
});
test('masteries do not change buffs or heal; reserve skill and toggle coexist, offline timing equals online game time',()=>{
 const g=make();equip(g,'weapon','light');const m=learn(g,masteries[0]),heal=g.character.skills.find(i=>i.templateId==='heal');g.character.hp=1;
 g.command({type:'USE_SKILL',characterId:g.character.id,itemId:heal.id,battleId:g.state.battle.id,heroActionSeq:0});const pending=structuredClone(g.state.battle.pendingSkill);toggle(g,m);assert.deepEqual(g.state.battle.pendingSkill,pending);
 const snapshot=g.snapshot(),healView=snapshot.inventory.find(i=>i.id===heal.id);assert.equal(healView.heal,Math.floor(snapshot.stats.maxHp*(.1+.05*snapshot.stats.INT)));assert.deepEqual(snapshot.statusEffects.hero,[]);
 const saved=JSON.parse(JSON.stringify(g.state)),a=new Game(g.config,structuredClone(saved),()=>0),b=new Game(g.config,structuredClone(saved),()=>0);a.tick(1000,1);b.tick(500,2);close(a.state.battle.combatants.hero.readiness,b.state.battle.combatants.hero.readiness);assert.equal(a.character.hp,b.character.hp);
});
test('legacy disabled dagger mastery migrates once preserving item slot and active toggle',()=>{
 const g=make(),old={id:'legacy-dagger',templateId:'dagger-mastery',name:'단검숙련',slot:'skill',stats:{}};g.character.skills.push(old);g.character.skillSlots[2]=old.id;g.state.battle.skillToggles['dagger-mastery']=true;
 const restored=new Game(g.config,JSON.parse(JSON.stringify(g.state)));assert.equal(restored.character.skills.find(i=>i.id===old.id).templateId,'light-weapon-mastery');assert.equal(restored.character.skillSlots[2],old.id);assert.equal(restored.character.skillToggles['light-weapon-mastery'],true);assert.equal(restored.state.battle.skillToggles['light-weapon-mastery'],undefined);assert.equal(restored.state.battle.skillToggles['dagger-mastery'],undefined);
 assert.deepEqual(new Game(g.config,JSON.parse(JSON.stringify(restored.state))).character.skills,restored.character.skills);
});
test('drop category weights cover exact boundaries and exclude zero-weight categories',()=>{
 for(const weights of [DROP_WEIGHTS,{weaponWeight:2,armorWeight:1,charmWeight:0,skillWeight:7}]){const counts={weapon:0,armor:0,charm:0,skill:0},total=Object.values(weights).reduce((a,b)=>a+b,0);for(let n=0;n<total;n++)counts[rollDropSlot(()=>n,weights)]++;assert.deepEqual(counts,Object.fromEntries(Object.entries(weights).map(([k,v])=>[k.replace('Weight',''),v])));}
 for(const kind of ['victory','boss','treasure'])for(const slot of ['weapon','armor','charm','skill']){const g=make();g.config.probabilities={...DEFAULT_PROBABILITIES,dropPercent:100,...Object.fromEntries(Object.keys(DROP_WEIGHTS).map(k=>[k,k===slot+'Weight'?1:0]))};const before=g.character.skills.length;g.reward(kind);assert.equal(g.state.lastReward.dropSlot,slot);assert.equal(g.state.lastReward.goldOnly,false);if(slot==='skill'){assert.equal(g.character.skills.length,before+1);assert.equal(g.state.lastReward.itemId,null);}else assert.equal(g.state.inventory.at(-1).slot,slot);}
 for(const kind of ['victory','boss','treasure']){const g=make();g.config.probabilities={...DEFAULT_PROBABILITIES,dropPercent:0};g.reward(kind);assert.equal(g.state.lastReward.itemId,null);assert.equal(g.state.lastReward.skillId,null);}
});
test('legacy probability settings keep configured encounter/drop rates and gain equal weights; bad inputs fail',()=>{
 const db=new DatabaseSync(':memory:');try{const store=new ProbabilitySettings(db);db.prepare('UPDATE probability_settings SET body=?').run(JSON.stringify({battlePercent:30,treasurePercent:10,passPercent:60,dropPercent:42}));assert.deepEqual(store.read().probabilities,{battlePercent:30,treasurePercent:10,passPercent:60,dropPercent:42,...DROP_WEIGHTS});
 for(const weights of [{weaponWeight:-1},{skillWeight:1.5},{charmWeight:NaN},{weaponWeight:0,armorWeight:0,charmWeight:0,skillWeight:0}])assert.throws(()=>validateProbabilities({...DEFAULT_PROBABILITIES,...weights}));
 }finally{db.close();}
 const c=structuredClone(SKILL_CATALOG);c.skills.find(d=>d.effect.type==='equipmentMastery').effect.category='unknown';assert.throws(()=>validateSkillCatalog(c));
});
test('an exhausted skill pool never rerolls another category or grants duplicates',()=>{
 for(const kind of ['victory','boss','treasure']){const g=make();g.character.skills=SKILL_CATALOG.skills.filter(d=>d.enabled).map(d=>({id:d.id,templateId:d.id,slot:'skill',name:d.name,stats:{}}));g.config.probabilities={...DEFAULT_PROBABILITIES,dropPercent:100,weaponWeight:0,armorWeight:0,charmWeight:0,skillWeight:1};const inventory=g.state.inventory.length,calls=[];g.rng=n=>{calls.push(n);return 0;};g.reward(kind);assert.equal(g.character.skills.length,28);assert.equal(g.state.inventory.length,inventory);assert.equal(g.state.lastReward.skillId,null);assert.equal(g.state.lastReward.itemId,null);assert.equal(g.state.lastReward.dropSlot,'skill');assert.deepEqual(calls,[10000,1]);}
});

test('mastery names and descriptions enumerate actual equipment; all twelve toggle outside combat and persist',()=>{
 const names=['단검·숏소드·레이피어 숙련','롱소드 숙련','손도끼 숙련','메이스 숙련','창 숙련','할버드 숙련','대검·전투도끼·전투망치 숙련','원소 지팡이 숙련','천옷 숙련','경량 갑옷 숙련','중형 갑옷 숙련','중장 갑옷 숙련'];
 assert.deepEqual(masteries.map(d=>d.name),names);
 for(const d of masteries){
  const g=make(),e=d.effect;g.phase('HOME',10000);g.state.battle=null;g.state.enemy=null;
  const gear=equip(g,e.equipmentSlot,e.category),item=learn(g,d),before=g.snapshot();
  const targets=(e.equipmentSlot==='weapon'?EQUIPMENT_CATALOG.weapons:EQUIPMENT_CATALOG.armors).filter(x=>x[e.equipmentSlot+'Category']===e.category).map(x=>x.name);
  assert.ok(d.description.startsWith('적용 장비: '+targets.join(', ')+'.'));
  assert.deepEqual(d.useContexts,['combat','nonCombat']);
  assert.equal(skillAvailability(before,before.inventory.find(i=>i.id===item.id),0).ready,true);
  toggle(g,item);toggle(g,item);assert.equal(g.character.skillToggles[d.id],true);
  assert.equal(g.snapshot().combatStats.ACC,before.combatStats.ACC+e.accuracyBonus);
  assert.equal(g.snapshot().stats.DEF,before.stats.DEF+(e.defenseBonus||0));
  close(g.snapshot().stats.actionSpeed,before.stats.actionSpeed*(1+e.actionSpeedRate));
  assert.equal(g.state.battle,null);assert.equal(g.snapshot().inventory.find(i=>i.id===item.id).toggleOn,true);
  const restored=new Game(g.config,JSON.parse(JSON.stringify(g.state)),()=>0);
  assert.equal(restored.snapshot().inventory.find(i=>i.id===item.id).toggleOn,true);
  restored.phase('TRAVEL',10000);toggle(restored,item,false);assert.equal(restored.character.skillToggles[d.id],false);toggle(restored,item);
  restored.beginBattle();assert.equal(restored.character.skillToggles[d.id],true);assert.deepEqual(restored.state.battle.skillUseCounts,{});
  assert.equal(maintainedSkillBonuses(restored.state).ACC,e.accuracyBonus);
  restored.command({type:'UNEQUIP',characterId:restored.character.id,itemId:item.id});assert.deepEqual(maintainedSkillBonuses(restored.state),{ACC:0});assert.equal(restored.character.skillToggles[d.id],true);
  restored.command({type:'EQUIP',characterId:restored.character.id,itemId:item.id});assert.equal(maintainedSkillBonuses(restored.state).ACC,e.accuracyBonus);
  restored.character.hp=0;assert.deepEqual(maintainedSkillBonuses(restored.state),{ACC:0});restored.character.hp=1;
  restored.phase('HOME',10000);restored.state.battle=null;restored.state.enemy=null;assert.equal(restored.character.skillToggles[d.id],true);
  delete restored.character.equipment[e.equipmentSlot];assert.deepEqual(maintainedSkillBonuses(restored.state),{ACC:0});restored.character.equipment[e.equipmentSlot]=gear.id;
  toggle(restored,item,false);const off=new Game(g.config,JSON.parse(JSON.stringify(restored.state)));assert.equal(off.character.skillToggles[d.id],false);assert.deepEqual(maintainedSkillBonuses(off.state),{ACC:0});
 }
});
test('persistent OFF wins over legacy battle ON, old names refresh and character preferences stay isolated',()=>{
 const g=make(),d=masteries[0],item=learn(g,d);item.name='경량 검 숙련';g.character.skillToggles[d.id]=false;g.state.battle.skillToggles[d.id]=true;
 const restored=new Game(g.config,JSON.parse(JSON.stringify(g.state)));assert.equal(restored.character.skillToggles[d.id],false);assert.equal(restored.character.skills.find(i=>i.id===item.id).name,d.name);assert.equal(restored.state.battle.skillToggles[d.id],undefined);
 g.phase('HOME',10000);g.state.battle=null;g.state.enemy=null;const first=g.character;toggle(g,item);g.create({name:'다른 모험가',appearanceId:'warrior'});const second=g.state.characters.find(c=>c.id!==first.id);g.selectCharacter(second.id);
 assert.deepEqual(g.character.skillToggles,{});assert.equal(first.skillToggles[d.id],true);g.selectCharacter(first.id);assert.equal(g.snapshot().inventory.find(i=>i.id===item.id).toggleOn,true);
});
test('noncombat toggles keep stale battle, foreign character and death guards',()=>{
 const g=make(),item=learn(g,masteries[0]),battle=g.state.battle;
 const command={type:'TOGGLE_SKILL',characterId:g.character.id,itemId:item.id,enabled:true,battleId:null,heroActionSeq:null};
 assert.throws(()=>g.command(command),/행동 주기/);
 g.phase('HOME',10000);g.state.battle=null;g.state.enemy=null;
 assert.throws(()=>g.command({...command,battleId:battle.id,heroActionSeq:0}),/행동 주기/);
 assert.throws(()=>g.command({...command,characterId:'someone-else'}),/캐릭터/);
 g.character.hp=0;assert.throws(()=>g.command(command),/지금은/);assert.deepEqual(g.character.skillToggles,{});
});


test('cloth mastery adds only DEF to actual incoming attacks and displayed breakdown, without stacking',()=>{
 const g=make();equip(g,'armor','cloth');const d=masteries.find(d=>d.id==='cloth-armor-mastery'),item=learn(g,d),base=g.snapshot();
 toggle(g,item);const on=g.snapshot();
 assert.deepEqual(on.stats,{...base.stats,DEF:base.stats.DEF+5});
 assert.equal(on.combatStats.ACC,base.combatStats.ACC);
 assert.equal(on.defenseBreakdown.DEF.equipmentMastery,5);
 assert.match(defenseTooltip('DEF',on.defenseBreakdown.DEF),/장비 숙련\(5\)/);
 assert.match(skillDescription(on.inventory.find(i=>i.id===item.id)),/DEF \+5/);
 g.character.skillSlots[2]=item.id;assert.equal(g.snapshot().stats.DEF,base.stats.DEF+5);
 g.rng=()=>0;g.battleAction('enemy');assert.equal(g.state.battle.lastHit.calculation.defense,base.stats.DEF+5);
 toggle(g,item,false);g.battleAction('enemy');assert.equal(g.state.battle.lastHit.calculation.defense,base.stats.DEF);
 assert.doesNotMatch(defenseTooltip('DEF',g.snapshot().defenseBreakdown.DEF),/장비 숙련/);
 toggle(g,item);equip(g,'armor','light');const mismatch=g.snapshot();toggle(g,item,false);assert.deepEqual(g.snapshot().stats,mismatch.stats);
});
test('mastery DEF bonus is optional for existing templates and rejects invalid values',()=>{
 const c=structuredClone(SKILL_CATALOG),e=c.skills.find(d=>d.id==='cloth-armor-mastery').effect;
 delete e.defenseBonus;assert.doesNotThrow(()=>validateSkillCatalog(c));
 for(const value of [null,'5',.5,NaN,Infinity,21,-21]){e.defenseBonus=value;assert.throws(()=>validateSkillCatalog(c),/mastery defense bonus/);}
 e.defenseBonus=5;assert.doesNotThrow(()=>validateSkillCatalog(c));
});
