import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hitResult, penetration, attack, stats } from '../src/combat.js';
import { Game } from '../src/game.js';
const config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url)));
const make = (cls = 'warrior', rng = () => 11) => { const g = new Game(config, null, rng); g.create({name: '모험가', appearanceId: cls});g.state.homePaused=false; return g; };
test('d20 boundaries, natural 1/20, documented probability table', () => {
  for (const [margin, tier] of [[-6,0],[-5,1],[-1,1],[0,2],[9,2],[10,3]]) assert.equal(hitResult(10, margin, 0).tier, tier);
  assert.equal(hitResult(20,-30,0).tier,1); assert.equal(hitResult(1,30,0).tier,2);
  for (const [delta, expected] of [[-5,[9,5,5,1]],[0,[4,5,10,1]],[5,[1,3,10,6]]]) { const count=[0,0,0,0]; for(let roll=1;roll<=20;roll++)count[hitResult(roll,delta,0).tier]++;assert.deepEqual(count,expected); }
});
test('penetration thresholds and exact examples; magic scales with STR', () => {
  assert.deepEqual([-3,-2,-1,0,2,3].map(x=>penetration(x,0)),[.5,.5,.75,1,1,1.25]);
  assert.equal(attack({roll:12,acc:7,defense:5,str:2,base:24,pen:4,ar:5}).damage,19);
  assert.equal(attack({roll:8,acc:5,defense:6,str:0,base:40,pen:2,ar:4}).damage,10);
  const a={roll:12,acc:5,defense:4,base:40,pen:4,ar:4};assert.equal(attack({...a,str:4}).damage,48);
});
test('level growth adds three per two levels to accuracy and defenses alongside HP', () => {
  for(const cls of ['warrior','wizard']){const g=make(cls),a=stats(g.state,config);
    for(const level of [4,7,10,40]){g.character.level=level;const b=stats(g.state,config);for(const k of ['STR','CON','DEX','PER','INT','RES','PEN','AR'])assert.equal(a[k],b[k],k);for(const k of ['ACC','DEF','FOR','REF','WIL'])assert.equal(b[k]-a[k],3*Math.floor(level/2),k);assert.equal(b.maxHp,a.maxHp+10*(level-1));assert.equal(b.LB,undefined);}
  }
});
test('each invested point has the requested defense coefficients',()=>{
 const effects={STR:{FOR:2},CON:{FOR:2,maxHp:2},DEX:{REF:2},PER:{ACC:1,REF:2},INT:{WIL:2},RES:{DEF:1,WIL:2}};
 for(const [attribute,effect] of Object.entries(effects)){const g=make(),before=stats(g.state,config);g.command({type:'ALLOCATE_STAT',characterId:g.character.id,stat:attribute});const after=stats(g.state,config);for(const key of ['ACC','DEF','REF','FOR','WIL','maxHp','PEN','AR'])assert.equal(after[key]-before[key],effect[key]||0,`${attribute} -> ${key}`);}
});
test('boss accuracy and defenses use attributes and legendary gear with a level bonus',()=>{
 const g=make();g.state.mapId='volcano';for(const level of [1,4,10,40]){g.character.level=level;g.beginBattle(true);const e=g.state.enemy;assert.equal(e.level,level);assert.equal(e.ACC,10+e.PER+e.weapon.stats.ACC+3*Math.floor(e.level/2));assert.equal(e.DEF,10+e.RES+3*Math.floor(e.level/2));assert.equal(e.REF,10+2*e.DEX+2*e.PER+3*Math.floor(e.level/2));assert.equal(e.FOR,10+2*e.STR+2*e.CON+3*Math.floor(e.level/2));assert.equal(e.WIL,10+2*e.INT+2*e.RES+3*Math.floor(e.level/2));}
});
test('both classes finish unattended map attempts and preserve XP/items', () => {
  for(const cls of ['warrior','wizard']){const g=make(cls,n=>Math.min(n-1,11));g.character.attributes.STR=100;g.character.attributes.CON=100;g.character.attributes.PER=100;let arrivals=0;g.rng=n=>n===10000&&g.state.phase==='TRAVEL'?(arrivals++%2?2000:0):n===4?0:Math.min(n-1,11);const themes=new Set();let count=0;while(g.state.completed<3&&count++<1500){g.tick(20000,1);themes.add(g.state.theme);}assert.equal(g.state.completed,3);assert.ok(themes.has('village'));assert.ok(g.character.level>1);assert.ok(g.state.inventory.length>3);assert.ok(g.state.victories>0);assert.ok(g.state.chests>0);}
});
test('branch choices only advance; stale choice rejected; default choice progresses', () => {
  const g=make();g.character.attributes.CON=100;g.character.attributes.STR=100;g.advance();let previous=0;while(g.state.phase==='CHOICE_WAIT'&&previous<10){const choiceId=g.state.choiceId;g.command({characterId: g.character?.id, type:'CHOOSE',choiceId,direction:'left'});assert.equal(g.state.step,++previous);assert.throws(()=>g.command({characterId: g.character?.id, type:'CHOOSE',choiceId,direction:'left'}));while(!['CHOICE_WAIT','RETURN_HOME'].includes(g.state.phase))g.tick(g.state.remaining,1);}assert.ok(previous>0);assert.equal(g.state.phase,'RETURN_HOME');
});
test('online/offline rates preserve spent game time for every phase including choices and combat',()=>{
  assert.equal(config.onlineRate,1);assert.equal(config.offlineRate,2);
  const g=make();
  for(const phase of ['HOME','TRAVEL','CHOICE_WAIT','TREASURE','DOWNED','RETURN_HOME']){
    g.phase(phase,9000);g.tick(1000,config.onlineRate);g.tick(1000,config.offlineRate);
    assert.equal(g.state.remaining,6000,phase);
    g.tick(1000,config.onlineRate);assert.equal(g.state.remaining,5000,phase);
  }
});
test('offline choices expire at 4.5 seconds and combat deadlines respect independent speeds and time rates',()=>{
  for(const rate of [config.onlineRate,config.offlineRate]){
    const g=make();g.advance();assert.equal(g.state.phase,'CHOICE_WAIT');
    g.tick(config.choiceMs/rate-1,rate);assert.equal(g.state.phase,'CHOICE_WAIT');
    g.tick(1,rate);assert.equal(g.state.phase,'TRAVEL');assert.equal(g.state.step,1);
    g.beginBattle();g.character.hp=10000;g.state.enemy.hp=g.state.enemy.maxHp=10000;g.state.enemy.DEX=1;g.refreshBattleTiming();
    const hits=g.events.filter(e=>e.type==='hit').length;
    g.tick(g.state.remaining/rate-1,rate);assert.equal(g.events.filter(e=>e.type==='hit').length,hits);
    g.tick(1,rate);assert.equal(g.events.filter(e=>e.type==='hit').length,hits+1);
    assert.ok(g.state.remaining > 0);
  }
});
test('equipment during battle affects next attack; HP swaps cannot heal; equipped sale rejected',()=>{
  const g=make();g.state.run=1;g.state.step=1;g.state.risk=0;g.beginBattle();const before=stats(g.state,config);const item=g.item('weapon',2);g.state.inventory.push(item);g.command({characterId: g.character?.id, type:'EQUIP',itemId:item.id});assert.ok(stats(g.state,config).PEN>before.PEN);g.battleAction('hero');assert.equal(g.state.battle.lastHit.pen,stats(g.state,config).PEN);
  assert.throws(()=>g.command({characterId: g.character?.id, type:'SELL',itemId:item.id}));const armor=g.item('armor',2);g.state.inventory.push(armor);g.character.hp=5;g.command({characterId: g.character?.id, type:'EQUIP',itemId:armor.id});assert.equal(g.character.hp,5);g.command({characterId: g.character?.id, type:'UNEQUIP',itemId:armor.id});assert.equal(g.character.hp,5);const gold=g.state.gold;g.command({characterId: g.character?.id, type:'SELL',itemId:armor.id});assert.equal(g.state.gold,gold+armor.value);assert.throws(()=>g.command({characterId: g.character?.id, type:'SELL',itemId:armor.id}));
});
test('consecutive attacks have no old multi-attack penalty',()=>{
 const g=make();g.state.risk=0;g.beginBattle();g.state.enemy.hp=10000;
 for(let i=0;i<3;i++)g.battleAction('hero');
 const hits=g.events.filter(e=>e.type==='hit').map(e=>e.hit);
 assert.equal(new Set(hits.map(h=>h.calculation.acc)).size,1);
 assert.equal(g.state.battle.ap,undefined);assert.equal(g.state.battle.turn,undefined);
});
test('downed preserves possessions and returns home; no inventory silent cap',()=>{
  const g=make();g.state.step=1;g.state.run=1;g.state.runGold=0;g.state.risk=0;g.beginBattle();g.character.hp=1;g.state.battle.actor='enemy';g.state.enemy.ACC=100;g.battleAction('enemy');assert.equal(g.state.phase,'DOWNED');g.advance();g.advance();assert.equal(g.state.phase,'HOME');assert.equal(g.character.hp,0);g.advance();assert.equal(g.character.hp,stats(g.state,config).maxHp);
  const count=g.state.inventory.length;g.rng=()=>0;for(let i=0;i<120;i++)g.reward('victory');assert.equal(g.state.inventory.length,count+120);
});
test('DEX speed and configured tie policy determine the first actual action',()=>{
 const cfg=structuredClone(config);const g=new Game(cfg,null,()=>0);g.create({name:'모험가',appearanceId:'warrior'});g.state.risk=0;g.rng=n=>n===6?2:0;
 function first(){g.beginBattle();g.character.hp=10000;g.tick(g.state.remaining,1);return g.events.filter(e=>e.type==='hit').at(-1).hit.actor;}
 assert.equal(first(),'enemy');g.character.attributes.DEX=10;delete g.character.equipment.armor;
 cfg.actionSpeed.maxEventsPerTick=1;assert.equal(first(),'hero');g.state.pendingGameMs=0;
 cfg.initiative.tieWinner='enemy';assert.equal(first(),'enemy');
});
