import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../src/game.js';
import { actionSpeed, COMBAT_RULES_VERSION } from '../src/action-speed.js';
import { stats } from '../src/combat.js';
import { EQUIPMENT_CATALOG as catalog, generateEquipment, migrateArmorSpeed, validateCatalog } from '../src/equipment.js';
import { createCombatFeed } from '../public/combat-feedback.js';
const config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url)));
function make(dex = 0, enemyDEX = 0, budget = 500) {
  const c = structuredClone(config); c.actionSpeed.maxEventsPerTick = budget;
  const g = new Game(c, null, () => 19); g.create({ name: '속도 검증', appearanceId: 'warrior' });
  g.character.attributes.DEX = dex; g.character.attributes.CON = 100000; g.character.equipment = {};
  g.character.hp = stats(g.state, c).maxHp; g.state.risk = 0; g.beginBattle(); g.state.enemy.skills=[];
  Object.assign(g.state.enemy, { DEX: enemyDEX, ...actionSpeed(enemyDEX, 0, c), hp: 1e9, maxHp: 1e9 });
  g.state.enemy.weapon.damageMin = g.state.enemy.weapon.damageMax = 0;
  g.events = []; g.refreshBattleTiming(); return g;
}
const hits = g => g.events.filter(e => e.type === 'hit').map(e => e.hit);
const run = (g, total, pattern, rate = 1) => { let n = 0; while (total > 0) { const dt = Math.min(total, pattern[n++ % pattern.length]); g.tick(dt / rate, rate); total -= dt; } while (g.state.pendingGameMs > 0 || (g.state.phase === 'BATTLE' && g.state.remaining <= 1e-7)) g.tick(0); return g; };
const records = g => hits(g).map(h => ({ actor: h.actor, actionSeq: h.actionSeq, actorActionSeq: h.actorActionSeq, time: Math.round(h.combatTimeMs * 1e6), damage: h.damage, acc: h.calculation.acc }));
test('positive baseline, signed DEX floor and heavy armor exact relative multiplier', () => {
  for (const dex of [-100,0,10,20,10000]) {
    const light = actionSpeed(dex), heavy = actionSpeed(dex,.5);
    assert.ok(light.actionSpeed > 0); assert.equal(heavy.actionSpeed, light.actionSpeed / 2); assert.equal(heavy.actionIntervalMs, light.actionIntervalMs * 2);
  }
  assert.equal(actionSpeed(0).actionIntervalMs,2200); assert.equal(actionSpeed(20).actionIntervalMs,1100);
  for (const rate of [-.1,.51,NaN,Infinity]) assert.throws(() => actionSpeed(0,rate));
});
test('all nine armors across five grades use categories independent of AR; migration preserves rolls and charm DEX', () => {
  for (const t of catalog.armors) for (const grade of catalog.grades) {
    const item = generateEquipment({slot:'armor',templateId:t.id,gradeId:grade.id,rng:()=>0});
    const expected = catalog.armorCategories[t.armorCategory].actionSpeedPenaltyRate;
    assert.equal(item.actionSpeedPenaltyRate,expected); assert.equal(item.stats.DEX,undefined);
    const old = {...structuredClone(item),dexRulesVersion:2,stats:{...item.stats,DEX:-3}};
    delete old.armorSpeedRulesVersion;
    const charm = {slot:'charm',stats:{DEX:2}};migrateArmorSpeed([old,charm]);assert.deepEqual(old,item);assert.equal(charm.stats.DEX,2);
    migrateArmorSpeed([old]);assert.deepEqual(old,item);
  }
  for (const mutate of [c=>c.armors[0].armorCategory='unknown',c=>c.armors[0].DEX=0,c=>c.armorCategories.heavy.actionSpeedPenaltyRate=.51,c=>c.armorCategories.cloth.actionSpeedPenaltyRate=NaN]) {
    const c=structuredClone(catalog);mutate(c);assert.throws(()=>validateCatalog(c));
  }
});
test('independent readiness yields equal or double action frequency and no AP/round/accuracy penalties', () => {
  const equal=run(make(),22000,[200]);assert.equal(equal.state.battle.combatants.hero.actionSeq,10);assert.equal(equal.state.battle.combatants.enemy.actionSeq,10);
  const double=run(make(20),22000,[200]);assert.equal(double.state.battle.combatants.hero.actionSeq,20);assert.equal(double.state.battle.combatants.enemy.actionSeq,10);
  for (const key of ['ap','turn','attacks','firstActor','actor']) assert.equal(double.state.battle[key],undefined);
  assert.equal(new Set(hits(double).filter(h=>h.actor==='hero').map(h=>h.calculation.acc)).size,1);
});
test('50ms, 200ms, irregular and offline ticks have identical ordered events and HP', () => {
  const games=[[50],[200],[13,701,122,19,2450]].map(p=>run(make(7,3),30000,p));games.push(run(make(7,3),30000,[200],2));
  for(const g of games.slice(1)){assert.deepEqual(records(g),records(games[0]));assert.equal(g.character.hp,games[0].character.hp);assert.equal(g.state.enemy.hp,games[0].state.enemy.hp);}
});
test('event budget retains elapsed time including pending simultaneous attacks across saves',()=>{
  const normal=run(make(60,20),22000,[22000]);let limited=make(60,20,1);limited.tick(22000);
  assert.ok(limited.state.pendingGameMs>0);const events=[...limited.events];limited=new Game(limited.config,structuredClone(limited.state),()=>19);limited.events=events;
  run(limited,0,[1]);assert.deepEqual(records(limited),records(normal));assert.equal(limited.state.pendingGameMs,0);
});
test('a pending same-time action survives a budget boundary at exactly zero elapsed time',()=>{
 const g=make(0,0,1);g.tick(2200);assert.equal(g.state.battle.combatants.hero.actionSeq,1);assert.equal(g.state.battle.combatants.enemy.actionSeq,0);
 g.tick(0);assert.equal(g.state.battle.combatants.enemy.actionSeq,1);
});
test('different due times in one tick stay ordered; tie priority is deterministic; dead actor never retaliates',()=>{
 const g=make(0,1);g.tick(2200);assert.deepEqual(hits(g).map(h=>h.actor),['enemy','hero']);
 for(const winner of ['hero','enemy']){const t=make();t.config.initiative.tieWinner=winner;t.tick(2200);assert.deepEqual(hits(t).map(h=>h.actor),[winner,winner==='hero'?'enemy':'hero']);}
 const kill=make();kill.state.enemy.hp=1;kill.state.enemy.DEF=-100;kill.state.enemy.AR=0;kill.tick(2300);
 assert.equal(kill.state.phase,'TREASURE');assert.equal(hits(kill).length,1);assert.equal(kill.state.victories,1);assert.equal(kill.state.remaining,config.treasureMs-100);
 kill.tick(100);assert.equal(kill.state.victories,1);assert.equal(hits(kill).length,1);
});
test('gear/DEX changes retain progress, do not refresh skills, and preserve REF and current cooldown',()=>{
 const g=make();g.character.attributes.CON=0;g.character.hp=10;g.tick(1100);g.state.battle.skillUsed=true;const before=stats(g.state,g.config);g.character.skillCooldowns.heal={readyAt:12345};
 const plate=generateEquipment({slot:'armor',templateId:'plate',gradeId:'legendary',rng:()=>0});g.state.inventory.push(plate);
 g.command({type:'EQUIP',characterId:g.character.id,itemId:plate.id});const after=stats(g.state,g.config);
 assert.equal(after.DEX,before.DEX);assert.equal(after.REF,before.REF);assert.equal(after.actionSpeed,before.actionSpeed/2);assert.equal(g.state.battle.combatants.hero.readiness,.5);
 assert.equal(g.snapshot().battleTiming.hero.nextActionMs,2200);assert.equal(g.state.battle.skillUsed,true);assert.equal(g.character.skillCooldowns.heal.readyAt,12345);
 const snapshot=structuredClone(g.state);g.snapshot();g.snapshot();assert.deepEqual(g.state,snapshot);
 g.command({type:'ALLOCATE_STAT',characterId:g.character.id,stat:'DEX'});assert.equal(g.state.battle.combatants.hero.readiness,.5);assert.ok(g.snapshot().battleTiming.hero.nextActionMs<2200);
 g.command({type:'UNEQUIP',characterId:g.character.id,itemId:plate.id});assert.equal(g.state.battle.combatants.hero.readiness,.5);
});
test('legacy reservation is preserved once, frozen through gear changes, and followed by new gauges without skill reset',()=>{
 let g=make();g.character.attributes.CON=0;g.character.hp=1;g.character.skillCooldowns.heal={readyAt:12345};const old=structuredClone(g.state);
 Object.assign(old.battle,{rulesVersion:4,actor:'enemy',turn:4,ap:2,attacks:1,skillUsed:true,skillUseCounts:{heal:1}});old.remaining=350;old.duration=1100;
 g=new Game(config,old,()=>19);assert.equal(g.state.battle.rulesVersion,COMBAT_RULES_VERSION);assert.equal(g.events.length,0);assert.equal(g.state.battle.transition.remainingMs,350);
 g.tick(100);g.command({type:'ALLOCATE_STAT',characterId:g.character.id,stat:'DEX'});assert.equal(g.state.remaining,250);assert.equal(g.state.battle.combatants.hero.readiness,0);
 g=new Game(config,structuredClone(g.state),()=>19);g.tick(350);assert.equal(hits(g).length,1);assert.equal(hits(g)[0].actor,'enemy');assert.equal(g.state.battle.transition,undefined);
 assert.equal(g.state.battle.combatants.hero.actionSeq,0);assert.equal(g.state.battle.skillUsed,true);assert.equal(g.state.battle.skillUseCounts.heal,1);assert.deepEqual(g.character.skillCooldowns,{});
 assert.ok(Math.abs(g.state.battle.combatants.hero.readiness-100/stats(g.state,config).actionIntervalMs)<1e-9);
 const restored=new Game(config,structuredClone(g.state),()=>19);assert.equal(restored.state.battle.transition,undefined);assert.deepEqual(restored.state.battle,g.state.battle);
 for(const phase of ['DOWNED','TREASURE','RETURN_HOME']){const s=structuredClone(old);s.phase=phase;s.battle.rulesVersion=4;delete s.battle.transition;const r=new Game(config,s);assert.equal(r.state.battle.transition,undefined);}
});
test('zero cooldown permits use on each side of hero cycle boundary, enemy actions cannot refresh or expire a request',()=>{
 const g=make(20,40);g.character.hp=1;const cmd=()=>({type:'USE_SKILL',characterId:g.character.id,itemId:g.character.skillSlots[0],battleId:g.state.battle.id,heroActionSeq:g.state.battle.combatants.hero.actionSeq});
 const initial=cmd();g.tick(800);assert.equal(g.state.battle.combatants.enemy.actionSeq,1);g.command(initial);assert.equal(g.state.battle.skillUseCounts.heal,undefined);assert.ok(g.state.battle.pendingSkill);
 assert.throws(()=>g.command(initial),/이미/);g.tick(300);assert.equal(g.state.battle.combatants.hero.actionSeq,1);assert.throws(()=>g.command(initial),/지났/);
 g.command(cmd());assert.equal(g.state.battle.skillUseCounts.heal,1);g.tick(1100);assert.equal(g.state.battle.skillUseCounts.heal,2);assert.throws(()=>g.command(cmd()),/소진/);
 assert.throws(()=>g.command({...cmd(),characterId:'other'}),/캐릭터/);assert.throws(()=>g.command({...cmd(),battleId:'old'}),/지났/);
});
test('combat feed suppresses previous battle events when multiple phases fit in one tick',()=>{
 const feed=createCombatFeed();const state={eventSeq:0,battle:{id:'new'}};feed.consume({state,logs:[],serverTime:100},true);
 const log=(seq,id)=>({seq,at:100,type:'hit',hit:{battleId:id,actor:'hero'}});
 assert.deepEqual(feed.consume({state:{...state,eventSeq:3},serverTime:100,logs:[log(1,'old'),log(2,'new'),log(3,'old')]},true).map(e=>e.seq),[2]);
});
