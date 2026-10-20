import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Game} from '../src/game.js';
import {stats} from '../src/combat.js';
import {skillValues,SKILL_CATALOG} from '../src/skills.js';
import {BASE_STATS,EQUIPMENT_CATALOG as c,generateEquipment,validateCatalog} from '../src/equipment.js';
const config=JSON.parse(readFileSync(new URL('../config.json',import.meta.url)));
const make=(cls='wizard')=>{const g=new Game(structuredClone(config),null,()=>0);g.create({name: '모험가', appearanceId: cls});g.state.homePaused=false;g.state.risk=0;return g;};
const charm=(id,grade='normal',rng=()=>0)=>generateEquipment({slot:'charm',templateId:id,gradeId:grade,rng});
const equip=(g,item)=>{g.state.inventory.push(item);g.command({characterId: g.character?.id, type:'EQUIP',itemId:item.id});};
test('six charm categories x five grades have exact bonuses, distinct uniform secondary options and no special roll',()=>{
 const bonuses=[[1,0],[1,1],[2,0],[2,1],[2,2]];
 for(const t of c.charms)for(const [index,g] of c.grades.entries())for(let secondary=0;secondary<5;secondary++){
  const calls=[],i=charm(t.id,g.id,n=>{calls.push(n);return secondary;});
  const [primary,extra]=bonuses[index];assert.equal(i.stats[t.primaryStat],primary);assert.equal(i.primaryStat,t.primaryStat);assert.equal(i.special,null);assert.equal(i.gradeId,g.id);assert.equal(i.classId,undefined);
  assert.deepEqual(calls,extra?[5]:[]);assert.equal(Object.values(i.stats).reduce((a,b)=>a+b,0),primary+extra);
  assert.equal(Object.keys(i.stats).length,extra?2:1);assert.ok(Object.keys(i.stats).every(s=>BASE_STATS.includes(s)));
  if(extra){assert.equal(i.secondaryStat,BASE_STATS.filter(s=>s!==t.primaryStat)[secondary]);assert.equal(i.stats[i.secondaryStat],extra);}else assert.equal(i.secondaryStat,undefined);
 }
});
test('charm rarity and category rolls cover 60/25/10/4/1 and six categories equally',()=>{
 const counts=Object.fromEntries(c.grades.map(g=>[g.id,0]));for(let roll=0;roll<100;roll++){const i=generateEquipment({slot:'charm',rng:n=>n===100?roll:0});counts[i.gradeId]++;}assert.deepEqual(Object.values(counts),[60,25,10,4,1]);
 for(let choice=0;choice<6;choice++)assert.equal(generateEquipment({slot:'charm',rng:n=>n===6?choice:0}).templateId,c.charms[choice].id);
 const bad=structuredClone(c);bad.charms[0].primaryStat='ACC';assert.throws(()=>validateCatalog(bad));
});
test('all six equipped base stats enter unchanged derived formulas once for both classes',()=>{
 const effects={STR:{STR:1,FOR:1},CON:{CON:1,FOR:1,maxHp:5},DEX:{DEX:1,REF:1},PER:{PER:1,ACC:1,REF:1},INT:{INT:1,WIL:1},RES:{RES:1,DEF:1,WIL:1}};
 for(const cls of ['warrior','wizard'])for(const t of c.charms){const g=make(cls),before=stats(g.state,g.config);equip(g,charm(t.id));const after=stats(g.state,g.config);
  for(const key of [...BASE_STATS,'ACC','DEF','FOR','REF','WIL','maxHp','AR','PEN','LB'])assert.equal(after[key]-before[key],effects[t.primaryStat][key]||0,`${cls} ${t.id} ${key}`);
 }
});
test('DEX charms increase speed under heavy armor without removing its relative penalty; CON swaps never heal',()=>{
 const g=make();g.character.attributes.DEX=2;equip(g,generateEquipment({slot:'armor',templateId:'plate',gradeId:'normal',rng:()=>0}));assert.equal(stats(g.state,g.config).DEX,2);
 const before=stats(g.state,g.config);g.beginBattle();g.tick(100,1);const progress=g.state.battle.combatants.hero.readiness;
 equip(g,charm('agility-charm','excellent'));const after=stats(g.state,g.config);assert.equal(after.DEX,4);assert.ok(after.actionSpeed>before.actionSpeed);assert.equal(after.actionSpeedPenaltyRate,.5);assert.equal(g.state.battle.combatants.hero.readiness,progress);
 const con=charm('vitality-charm','excellent');g.character.hp=20;equip(g,con);assert.equal(g.character.hp,20);g.character.hp=stats(g.state,g.config).maxHp;g.command({characterId: g.character?.id, type:'UNEQUIP',itemId:con.id});assert.equal(g.character.hp,stats(g.state,g.config).maxHp);const hp=g.character.hp;g.command({characterId: g.character?.id, type:'EQUIP',itemId:con.id});assert.equal(g.character.hp,hp);
});
test('INT accessory increases manual healing; STR boosts actual weapon damage',()=>{
 for(const cls of ['warrior','wizard']) {
  const g=make(cls);equip(g,charm('wisdom-charm','excellent'));g.config.initiative.enemyDEX=-10;g.beginBattle();g.character.hp=1;
  const effect=skillValues(SKILL_CATALOG.skills[0],stats(g.state,g.config));
  g.command({characterId: g.character?.id, type:'USE_SKILL',itemId:g.character.skillSlots[0],battleId:g.state.battle.id,heroActionSeq:g.state.battle.combatants.hero.actionSeq});assert.equal(g.character.hp,1+effect.heal);
 }
 const a=make('warrior'),b=make('warrior');equip(b,charm('strength-charm','excellent'));
 for(const g of [a,b]){g.config.initiative.enemyDEX=-10;g.beginBattle();g.state.enemy.hp=g.state.enemy.maxHp=10000;g.state.enemy.DEF=-30;g.state.enemy.AR=0;g.rng=()=>11;g.battleAction('hero');}
 const hit=b.state.battle.lastHit;assert.ok(hit.damage>a.state.battle.lastHit.damage);
});
test('legacy items are replaced once, preserve equipped IDs and new gear, and never reroll on reload',()=>{
 for(const cls of ['warrior','wizard']){const g=make(cls),current=structuredClone(g.state.inventory);const old=[{id:'old-charm',slot:'charm',name:'새벽의 부적',tier:1,stats:{ACC:2,WIL:1}}, {id:'old-weapon',slot:'weapon',icon:'staff',tier:2,stats:{power:8,PEN:2}}, {id:'old-armor',slot:'armor',tier:0,stats:{HP:10,AR:4}}];g.state.inventory.push(...old);g.character.equipment={charm:'old-charm',weapon:'old-weapon',armor:'old-armor'};g.beginBattle();const battle=structuredClone(g.state.battle),equipment={...g.character.equipment};const migrated=new Game(g.config,structuredClone(g.state),()=>0);
 assert.deepEqual(migrated.character.equipment,equipment);assert.deepEqual(migrated.state.battle,battle);assert.deepEqual(migrated.state.inventory.slice(0,current.length),current);
 const [ch,w,a]=migrated.state.inventory.slice(-3);assert.deepEqual(ch.stats,{STR:1,CON:1});assert.equal(ch.gradeId,'fine');assert.equal(w.templateId,'fire-staff');assert.equal(w.gradeId,'excellent');assert.equal(a.templateId,'leather');assert.equal(ch.id,'old-charm');
 const saved=structuredClone(migrated.state),again=new Game(g.config,structuredClone(saved),()=>{throw Error('Unexpected reroll');});assert.deepEqual(again.state,saved);
 }
});
test('fresh starter gear uses the current catalog; treasure grants only gold at every risk',()=>{
 for(const cls of ['warrior','wizard']){const g=make(cls);assert.equal(g.state.inventory.length,2);assert.deepEqual(g.state.inventory.map(i=>i.slot),['weapon','armor']);assert.ok(g.state.inventory.every(i=>i.templateId));assert.ok(g.state.inventory.filter(i=>i.slot!=='skill').every(i=>i.gradeId==='normal'));assert.equal(g.character.equipment.charm,undefined);
  g.rng=()=>{throw Error('Treasure must not roll equipment');};const before=structuredClone(g.state.inventory);g.character.xp=39;
  for(const [index,risk] of [0,3,10].entries()){
   g.state.risk=risk;const gold=g.state.gold,expected=g.config.balance.treasureGold+risk*g.config.balance.riskGold;g.reward('treasure');
   assert.deepEqual(g.state.inventory,before);assert.equal(g.state.lastReward.itemId,null);assert.equal(g.state.lastReward.xp,0);assert.equal(g.state.lastReward.goldOnly,true);assert.equal(g.character.xp,39);assert.equal(g.character.level,1);assert.equal(g.state.gold,gold+expected);assert.equal(g.state.chests,index+1);assert.equal(g.events.at(-1).text,`보물 발견 · 금화 +${expected}`);
  }
 }
});
