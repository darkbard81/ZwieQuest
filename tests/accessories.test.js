import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Game} from '../src/game.js';
import {stats} from '../src/combat.js';
import {tacticEffect} from '../src/tactics.js';
import {BASE_STATS,EQUIPMENT_CATALOG as c,generateEquipment,validateCatalog} from '../src/equipment.js';
const config=JSON.parse(readFileSync(new URL('../config.json',import.meta.url)));
const make=(cls='wizard')=>{const g=new Game(structuredClone(config),null,()=>0);g.create(cls);g.state.risk=0;return g;};
const charm=(id,grade='normal',rng=()=>0)=>generateEquipment({slot:'charm',templateId:id,gradeId:grade,rng});
const equip=(g,item)=>{g.state.inventory.push(item);g.command({type:'EQUIP',itemId:item.id});};
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
  for(const key of [...BASE_STATS,'ACC','DEF','FOR','REF','WIL','maxHp','AR','PEN','AP','LB'])assert.equal(after[key]-before[key],effects[t.primaryStat][key]||0,`${cls} ${t.id} ${key}`);
 }
});
test('DEX offsets plate penalty and changes next initiative; CON swaps never create HP',()=>{
 const g=make();equip(g,generateEquipment({slot:'armor',templateId:'plate',gradeId:'normal',rng:()=>0}));assert.equal(stats(g.state,g.config).DEX,-1);
 g.config.initiative.enemyDEX=0;g.beginBattle();assert.equal(g.state.battle.firstActor,'enemy');equip(g,charm('agility-charm','excellent'));assert.equal(stats(g.state,g.config).DEX,1);assert.equal(g.state.battle.firstActor,'enemy');g.beginBattle();assert.equal(g.state.battle.firstActor,'hero');
 const con=charm('vitality-charm','excellent');g.state.hp=20;equip(g,con);assert.equal(g.state.hp,20);g.state.hp=stats(g.state,g.config).maxHp;g.command({type:'UNEQUIP',itemId:con.id});assert.equal(g.state.hp,stats(g.state,g.config).maxHp);const hp=g.state.hp;g.command({type:'EQUIP',itemId:con.id});assert.equal(g.state.hp,hp);
});
test('INT accessory increases actual class tactics; STR boosts actual weapon damage',()=>{
 for(const [cls,tactic] of [['warrior','defend'],['warrior','assault'],['wizard','heal'],['wizard','burst']]){
  const g=make(cls);equip(g,charm('wisdom-charm','excellent'));g.state.tactic=tactic;g.config.initiative.enemyDEX=-10;g.beginBattle();g.state.hp=1;const effect=tacticEffect(tactic,config.classes[cls].base.INT+2,g.config);
  if(tactic!=='defend')g.battleAction();if(tactic==='heal')assert.equal(g.state.hp,1+effect.heal);else assert.deepEqual(g.state.battle.roundEffects,effect);
 }
 const a=make('warrior'),b=make('warrior');equip(b,charm('strength-charm','excellent'));
 for(const g of [a,b]){g.config.initiative.enemyDEX=-10;g.beginBattle();g.state.enemy.hp=g.state.enemy.maxHp=10000;g.state.enemy.DEF=-30;g.state.enemy.AR=0;g.rng=()=>11;g.battleAction();}
 const hit=b.state.battle.lastHit;assert.ok(hit.damage>a.state.battle.lastHit.damage);
});
test('legacy items are replaced once, preserve equipped IDs and new gear, and never reroll on reload',()=>{
 for(const cls of ['warrior','wizard']){const g=make(cls),current=structuredClone(g.state.inventory);const old=[{id:'old-charm',slot:'charm',name:'새벽의 부적',tier:1,stats:{ACC:2,WIL:1}}, {id:'old-weapon',slot:'weapon',icon:'staff',tier:2,stats:{power:8,PEN:2}}, {id:'old-armor',slot:'armor',tier:0,stats:{HP:10,AR:4}}];g.state.inventory.push(...old);g.state.equipment={charm:'old-charm',weapon:'old-weapon',armor:'old-armor'};g.beginBattle();const battle=structuredClone(g.state.battle),equipment={...g.state.equipment};const migrated=new Game(g.config,structuredClone(g.state),()=>0);
 assert.deepEqual(migrated.state.equipment,equipment);assert.deepEqual(migrated.state.battle,battle);assert.deepEqual(migrated.state.inventory.slice(0,current.length),current);
 const [ch,w,a]=migrated.state.inventory.slice(-3);assert.deepEqual(ch.stats,{STR:1,CON:1});assert.equal(ch.gradeId,'fine');assert.equal(w.templateId,'fire-staff');assert.equal(w.gradeId,'excellent');assert.equal(a.templateId,cls==='wizard'?'robe':'leather');assert.equal(ch.id,'old-charm');
 const saved=structuredClone(migrated.state),again=new Game(g.config,structuredClone(saved),()=>{throw Error('Unexpected reroll');});assert.deepEqual(again.state,saved);
 }
});
test('fresh starter gear uses the current catalog; treasure grants no equipment',()=>{
 for(const cls of ['warrior','wizard']){const g=make(cls);assert.equal(g.state.inventory.length,2);assert.deepEqual(g.state.inventory.map(i=>i.slot),['weapon','armor']);assert.ok(g.state.inventory.every(i=>i.templateId));assert.ok(g.state.inventory.every(i=>i.gradeId==='normal'));assert.equal(g.state.equipment.charm,undefined);
  g.state.risk=0;g.rng=()=>{throw Error('Treasure must not roll equipment');};const before=structuredClone(g.state.inventory);g.reward('treasure');assert.deepEqual(g.state.inventory,before);assert.equal(g.state.lastReward.itemId,null);assert.equal(g.state.lastReward.xp,g.config.balance.treasureXP);assert.equal(g.state.gold,g.config.balance.treasureGold);assert.equal(g.state.chests,1);
 }
});
