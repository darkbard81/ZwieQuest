import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hitResult, penetration, attack, levelBonus, stats } from '../src/combat.js';
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
test('level growth does not increase base stats, PEN, AR or AP; LB once', () => {
  assert.deepEqual([1,4,7,10].map(levelBonus),[0,1,2,3]);
  for(const cls of ['warrior','wizard']){const g=make(cls),a=stats(g.state,config);g.character.level=4;const b=stats(g.state,config);for(const k of ['STR','CON','DEX','PER','INT','RES','PEN','AR','AP'])assert.equal(a[k],b[k]);for(const k of ['ACC','DEF','FOR','REF','WIL'])assert.equal(b[k],a[k]+1);}
});
test('both classes finish unattended map attempts and preserve XP/items', () => {
  for(const cls of ['warrior','wizard']){const g=make(cls,n=>Math.min(n-1,11));let arrivals=0;g.rng=n=>n===10000&&g.state.phase==='TRAVEL'?(arrivals++%2?2000:0):Math.min(n-1,11);const themes=new Set();let count=0;while(g.state.completed<3&&count++<1500){g.tick(20000,1);themes.add(g.state.theme);}assert.equal(g.state.completed,3);assert.ok(themes.has('village'));assert.ok(g.character.level>1);assert.ok(g.state.inventory.length>3);assert.ok(g.state.victories>0);assert.ok(g.state.chests>0);}
});
test('branch choices only advance; stale choice rejected; default choice progresses', () => {
  const g=make();g.character.attributes.CON=100;g.character.attributes.STR=100;g.advance();let previous=0;while(g.state.phase==='CHOICE_WAIT'&&previous<10){const choiceId=g.state.choiceId;g.command({characterId: g.character?.id, type:'CHOOSE',choiceId,direction:'left'});assert.equal(g.state.step,++previous);assert.throws(()=>g.command({characterId: g.character?.id, type:'CHOOSE',choiceId,direction:'left'}));while(!['CHOICE_WAIT','RETURN_HOME'].includes(g.state.phase))g.advance();}assert.ok(previous>0);assert.equal(g.state.phase,'RETURN_HOME');
});
test('rate switch preserves spent game time; choice timeout is real-time and not extended',()=>{
  const g=make();g.phase('TRAVEL',6000);g.tick(1000,1);g.tick(1000,1.5);assert.equal(g.state.remaining,3500);
  g.phase('CHOICE_WAIT',9000);g.tick(1000,1);g.tick(1000,1.5);assert.equal(g.state.remaining,7000);
});
test('equipment during battle affects next attack; HP swaps cannot heal; equipped sale rejected',()=>{
  const g=make();g.state.run=1;g.state.step=1;g.state.risk=0;g.beginBattle();while(g.state.battle.actor!=='hero')g.battleAction();const before=stats(g.state,config);const item=g.item('weapon',2);g.state.inventory.push(item);g.command({characterId: g.character?.id, type:'EQUIP',itemId:item.id});assert.ok(stats(g.state,config).PEN>before.PEN);g.battleAction();assert.equal(g.state.battle.lastHit.pen,stats(g.state,config).PEN);
  assert.throws(()=>g.command({characterId: g.character?.id, type:'SELL',itemId:item.id}));const armor=g.item('armor',2);g.state.inventory.push(armor);g.character.hp=5;g.command({characterId: g.character?.id, type:'EQUIP',itemId:armor.id});assert.equal(g.character.hp,5);g.command({characterId: g.character?.id, type:'UNEQUIP',itemId:armor.id});assert.equal(g.character.hp,5);const gold=g.state.gold;g.command({characterId: g.character?.id, type:'SELL',itemId:armor.id});assert.equal(g.state.gold,gold+armor.value);assert.throws(()=>g.command({characterId: g.character?.id, type:'SELL',itemId:armor.id}));
});
test('three AP and attack penalties reset each turn',()=>{
  const g=make();g.state.step=1;g.state.risk=0;g.beginBattle();g.state.enemy.hp=g.state.enemy.maxHp=10000;g.character.hp=10000;while(g.state.battle.actor!=='hero')g.battleAction();
  g.battleAction();assert.equal(g.state.battle.ap,2);assert.equal(g.state.battle.attacks,1);const first=g.state.battle.lastHit.margin;g.battleAction();assert.equal(g.state.battle.lastHit.margin,first-5);assert.equal(g.state.battle.ap,1);g.battleAction();assert.equal(g.state.battle.lastHit.margin,first-10);assert.equal(g.state.battle.actor,'enemy');assert.equal(g.state.battle.ap,3);for(let i=0;i<3;i++)g.battleAction();assert.equal(g.state.battle.actor,'hero');assert.equal(g.state.battle.attacks,0);
});
test('downed preserves possessions and returns home; no inventory silent cap',()=>{
  const g=make();g.state.step=1;g.state.run=1;g.state.runGold=0;g.state.risk=0;g.beginBattle();g.character.hp=1;g.state.battle.actor='enemy';g.state.enemy.ACC=100;g.battleAction();assert.equal(g.state.phase,'DOWNED');g.advance();g.advance();assert.equal(g.state.phase,'HOME');assert.equal(g.character.hp,0);g.advance();assert.equal(g.character.hp,stats(g.state,config).maxHp);
  const count=g.state.inventory.length;g.rng=()=>0;for(let i=0;i<120;i++)g.reward('victory');assert.equal(g.state.inventory.length,count+120);
});
test('DEX initiative and configured tie policy determine first actor',()=>{
 const cfg=structuredClone(config);const g=new Game(cfg,null,()=>0);g.create({name: '모험가', appearanceId: 'warrior'});g.state.homePaused=false;g.state.step=1;g.state.risk=0;g.rng=n=>n===6?2:0;g.beginBattle();assert.equal(g.state.enemy.DEX,10);assert.equal(g.state.battle.actor,'enemy');
 g.character.attributes.DEX=10;delete g.character.equipment.armor;g.beginBattle();assert.equal(g.state.battle.actor,'hero');cfg.initiative.tieWinner='enemy';g.beginBattle();assert.equal(g.state.battle.actor,'enemy');
});
