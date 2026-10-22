import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Game} from '../src/game.js';
import {SKILL_CATALOG,validateSkillCatalog} from '../src/skills.js';
import {applyStatus,applyMirror} from '../src/status-effects.js';
import {skillDescription} from '../public/skills-view.js';
import {combatLogHTML} from '../public/combat-log.js';
const config=JSON.parse(readFileSync(new URL('../config.json',import.meta.url)));
function make(id='hamstring') {
 const g=new Game(config,null,()=>0);g.create({name:'두 판정',appearanceId:'warrior'});g.beginBattle();g.events=[];
 const w=g.state.inventory.find(i=>i.id===g.character.equipment.weapon);Object.assign(w,{damageMin:4,damageMax:4,damageRate:0,stats:{PEN:0,ACC:0}});
 Object.assign(g.state.enemy,{hp:10000,maxHp:10000,DEF:10,REF:10,FOR:10,WIL:10,AR:0,RES:0,ACC:10,DEX:-100,typeModifiers:{},skills:[]});
 const item={id:'two-stage',templateId:id,slot:'skill',stats:{}};g.character.skills.push(item);g.character.skillSlots[1]=item.id;
 return g;
}
function queue(g){g.command({type:'USE_SKILL',characterId:g.character.id,itemId:'two-stage',battleId:g.state.battle.id,heroActionSeq:g.state.battle.combatants.hero.actionSeq});}
function rolls(g,values){let n=0;g.rng=size=>size===20?(assert.ok(n<values.length,'unexpected attack roll'),values[n++]-1):0;return ()=>n;}
const statuses=g=>g.state.battle.statuses.enemy;
test('weapon hit and status outcome are independent; second check changes neither damage nor action cost',()=>{
 for(const statusRoll of [1,5,10,20]){
  const g=make();queue(g);const count=rolls(g,[10,statusRoll]);g.battleAction('hero');const h=g.state.battle.lastHit;
  assert.equal(h.target,'DEF');assert.equal(h.damage,5);assert.equal(h.statusCheck.target,'FOR');assert.equal(h.statusCheck.roll,statusRoll);
  assert.equal(h.statusResult.applied,statusRoll>=10);assert.equal(statuses(g).length,statusRoll>=10?1:0);
  assert.equal(count(),2);assert.equal(g.state.battle.skillUseCounts.hamstring,1);assert.equal(g.state.battle.combatants.hero.actionSeq,1);assert.equal(g.events.filter(e=>e.type==='hit').length,1);assert.equal(g.state.battle.pendingSkill,undefined);
  assert.match(combatLogHTML(g.events.find(e=>e.type==='hit')),/combat-status/);
 }
 const g=make();g.state.enemy.FOR=100;queue(g);rolls(g,[10,20]);g.battleAction('hero');assert.equal(g.state.battle.lastHit.damage,5);assert.equal(statuses(g).length,0);
});
test('weapon miss/graze or lethal hit skips the status roll; weapon hit conversion gates only the first stage',()=>{
 for(const roll of [1,5]){const g=make();queue(g);const count=rolls(g,[roll]);g.battleAction('hero');assert.equal(count(),1);assert.equal(g.state.battle.lastHit.statusCheck,undefined);assert.equal(statuses(g).length,0);assert.equal(g.state.battle.skillUseCounts.hamstring,1);}
 const killed=make();killed.state.enemy.hp=1;queue(killed);const count=rolls(killed,[10]);killed.battleAction('hero');assert.equal(count(),1);assert.equal(killed.events.find(e=>e.type==='hit').hit.statusCheck,undefined);
 const g=make();g.character.attributes.PER=-5;applyStatus(g.state.battle,'hero','aware',15000,{INT:0});queue(g);rolls(g,[5,5]);g.battleAction('hero');
 assert.equal(g.state.battle.lastHit.originalTier,1);assert.equal(g.state.battle.lastHit.tier,2);assert.equal(g.state.battle.lastHit.statusCheck.tier,1);assert.equal(statuses(g).length,0);
});
test('status resistance and effective duration remain after successful secondary rolls; mirror consumed once',()=>{
 const immune=make();immune.state.enemy.statusResistance={resistance:{DEX:1}};queue(immune);rolls(immune,[10,10]);immune.battleAction('hero');assert.equal(immune.state.battle.lastHit.statusResult.reason,'immune');assert.equal(statuses(immune).length,0);
 const g=make();g.character.attributes.INT=4;g.state.enemy.RES=5;queue(g);rolls(g,[10,10]);g.battleAction('hero');assert.equal(statuses(g)[0].remainingMs,15300);
 const mirror=make('staggering-blow');applyMirror(mirror.state.battle,'enemy',60000,{INT:0});mirror.character.attributes.PER=50;queue(mirror);rolls(mirror,[10,10]);mirror.battleAction('hero');assert.equal(statuses(mirror).find(s=>s.id==='mirrored-image').bonus,20);
});
test('queued old saves use current two-stage rules, retain counts/timing and agree online/offline',()=>{
 const g=make();queue(g);g.state.enemy.hitDefense='WIL';g.state.enemy.weapon.hitDefense='WIL';g.state.inventory.find(i=>i.slot==='weapon').hitDefense='REF';
 const saved=JSON.parse(JSON.stringify(g.state)),a=new Game(config,structuredClone(saved),()=>0),b=new Game(config,structuredClone(saved),()=>0);
 assert.equal(a.state.enemy.hitDefense,'DEF');assert.equal(a.state.enemy.weapon.hitDefense,'DEF');assert.ok(a.state.inventory.filter(i=>i.slot==='weapon').every(i=>i.hitDefense==='DEF'));
 assert.deepEqual(a.state.battle,saved.battle);assert.equal(a.state.enemy.hp,saved.enemy.hp);assert.equal(a.character.equipment.weapon,g.character.equipment.weapon);
 rolls(a,[10,10]);rolls(b,[10,10]);a.tick(a.snapshot().stats.actionIntervalMs);b.tick(b.snapshot().stats.actionIntervalMs/2,2);
 assert.equal(a.state.battle.skillUseCounts.hamstring,1);assert.deepEqual(a.state.battle.skillUseCounts,b.state.battle.skillUseCounts);assert.deepEqual(statuses(a),statuses(b));
 assert.deepEqual(new Game(config,JSON.parse(JSON.stringify(a.state))).state,a.state);
});
test('monster attack skills also hit DEF then roll the hero status defense exactly once',()=>{
 const g=make();g.state.enemy.skills=['binding-strike'];g.state.enemy.hitDefense='WIL';g.state.enemy.weapon.hitDefense='WIL';g.state.enemy.weapon.damageMin=g.state.enemy.weapon.damageMax=0;g.state.battle.combatants.enemy.actionSeq=2;
 rolls(g,[10,10]);g.battleAction('enemy');const h=g.state.battle.lastHit;assert.equal(h.target,'DEF');assert.equal(h.statusCheck.target,'REF');assert.equal(h.statusResult.applied,true);assert.equal(g.state.battle.enemySkillUseCounts['binding-strike'],1);assert.equal(g.state.battle.combatants.enemy.actionSeq,3);
});
test('catalog requires a distinct status defense and concise descriptions expose both stages once',()=>{
 const bad=structuredClone(SKILL_CATALOG);delete bad.skills.find(s=>s.effect.type==='attack').effect.statusDefense;assert.throws(()=>validateSkillCatalog(bad),/status defense/);
 for(const id of ['hamstring','eye-gouge']){const g=make(id),item=g.snapshot().inventory.find(i=>i.id==='two-stage'),text=skillDescription(item);assert.match(text,/무기 명중 vs 회피\(DEF\)/);assert.match(text,/상태 판정: 명중 vs/);assert.equal(text.split('피해 +25%').length-1,1);if(id==='eye-gouge')assert.match(text,/명중 \+10.*반사\(REF\)/);}
 const g=make('light-weapon-mastery'),text=skillDescription(g.snapshot().inventory.find(i=>i.id==='two-stage'));assert.equal(text.split('적용 장비:').length-1,1);
});
