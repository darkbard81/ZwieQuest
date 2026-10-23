import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Game} from '../src/game.js';
import {stats} from '../src/combat.js';
import {skillDefinition} from '../src/skills.js';
import {applyStatus} from '../src/status-effects.js';
import {skillAvailability} from '../public/skills-view.js';
const config=JSON.parse(readFileSync(new URL('../config.json',import.meta.url)));
function make(){const g=new Game(structuredClone(config),null,()=>0);g.create({name:'자동 검증',appearanceId:'wizard'});g.state.risk=0;g.beginBattle();Object.assign(g.state.enemy,{skills:[],hp:100000,maxHp:100000,DEX:-100,ACC:-100,DEF:0,REF:0,FOR:0,WIL:0});g.state.enemy.weapon.damageMin=g.state.enemy.weapon.damageMax=0;g.events=[];g.refreshBattleTiming();return g;}
function learn(g,id,slot){const d=skillDefinition(id),i={id:'test-'+id,templateId:id,slot:'skill',name:d.name,stats:{}};g.character.skills.push(i);g.character.skillSlots[slot]=i.id;return i;}
const mode=(g,enabled)=>g.command({type:'SET_AUTO_SKILLS',characterId:g.character.id,enabled});
const use=(g,itemId=g.character.skillSlots[0])=>g.command({type:'USE_SKILL',characterId:g.character.id,itemId,battleId:g.state.battle.id,heroActionSeq:g.state.battle.combatants.hero.actionSeq});
const heroEvents=g=>g.events.filter(e=>(e.type==='skill'&&e.actor==='hero')||(e.type==='hit'&&e.hit.actor==='hero'));

test('mode defaults to manual, persists per character and across battle/restore; switching cancels reservation without cost',()=>{
 const g=make();assert.equal(g.character.autoSkills,false);g.character.hp=1;use(g);const readiness=structuredClone(g.state.battle.combatants);mode(g,true);assert.equal(g.state.battle.pendingSkill,undefined);assert.deepEqual(g.state.battle.skillUseCounts,{});assert.deepEqual(g.state.battle.combatants,readiness);const logs=g.events.length;mode(g,true);assert.equal(g.events.length,logs);assert.throws(()=>use(g),/자동 스킬/);
 const h=new Game(g.config,JSON.parse(JSON.stringify(g.state)),()=>0);assert.equal(h.snapshot().autoSkills,true);h.beginBattle();assert.equal(h.character.autoSkills,true);mode(h,false);h.character.hp=1;use(h);assert.ok(h.state.battle.pendingSkill);
 h.phase('HOME',1000);const first=h.character.id;mode(h,true);const second=h.create({name:'다른 모험가',appearanceId:'warrior'});h.selectCharacter(second.id);assert.equal(h.character.autoSkills,false);h.selectCharacter(first);assert.equal(h.character.autoSkills,true);
 assert.throws(()=>g.command({type:'SET_AUTO_SKILLS',characterId:'wrong',enabled:false}),/출전/);assert.throws(()=>mode(g,'yes'),/사용 여부/);
});
test('each automatic action chooses uniformly among eligible equipped direct skills, executes once and falls back after exhaustion',()=>{
 for(const pick of [0,1]){const g=make();g.character.skillSlots.fill(null);learn(g,'hamstring',0);learn(g,'eye-gouge',1);learn(g,'might-inspiration',5);g.character.skillSlots[5]=null;mode(g,true);const calls=[];g.rng=n=>{calls.push(n);return n===2?pick:n===20?19:0;};g.battleAction('hero');assert.equal(calls[0],2);assert.equal(heroEvents(g).length,1);assert.equal(g.state.battle.lastHit.skillId,pick?'eye-gouge':'hamstring');assert.equal(Object.values(g.state.battle.skillUseCounts).reduce((a,b)=>a+b),1);g.battleAction('hero');assert.equal(heroEvents(g).length,2);assert.equal(g.state.battle.skillUseCounts.hamstring,1);assert.equal(g.state.battle.skillUseCounts['eye-gouge'],1);g.battleAction('hero');assert.equal(heroEvents(g).length,3);assert.equal(g.state.battle.lastHit.skillId,undefined);}
});
test('eligibility at action time excludes full or blocked healing, and toggles; eligible healing replaces attack',()=>{
 const g=make();learn(g,'light-weapon-mastery',3);mode(g,true);g.battleAction('hero');assert.equal(g.state.battle.lastHit.skillId,undefined);assert.deepEqual(g.state.battle.skillUseCounts,{});assert.deepEqual(g.state.battle.skillToggles,{});
 g.character.hp=1;g.events=[];g.battleAction('hero');assert.equal(heroEvents(g).length,1);assert.equal(heroEvents(g)[0].skillId,'heal');assert.equal(heroEvents(g)[0].automatic,true);assert.equal(g.character.hp,6);
 g.character.skillSlots[1]=null;applyStatus(g.state.battle,'hero','enfeebled',10000,{INT:0});g.events=[];g.battleAction('hero');assert.equal(heroEvents(g)[0].type,'hit');assert.equal(g.state.battle.skillUseCounts.heal,1);
});
test('charm/domination prevents automatic skills and mode commands; dead or ended battles never consume skills',()=>{
 for(const id of ['charmed','dominated']){const g=make();mode(g,true);g.character.hp=1;applyStatus(g.state.battle,'hero',id,10000,{INT:0});assert.throws(()=>mode(g,false),/매혹/);g.battleAction('hero');assert.deepEqual(g.state.battle.skillUseCounts,{});assert.equal(heroEvents(g)[0].type,'hit');assert.equal(g.state.battle.lastHit.targetActor,id==='dominated'?'hero':'enemy');}
 for(const end of [g=>g.character.hp=0,g=>g.state.enemy.hp=0,g=>g.phase('HOME',1000)]){const g=make();mode(g,true);g.character.hp=1;end(g);g.battleAction('hero');assert.deepEqual(g.state.battle.skillUseCounts,{});}
});
test('automatic use respects DEX action boundary and survives offline/save without duplicating use',()=>{
 const g=make();g.character.hp=1;mode(g,true);const interval=stats(g.state,g.config).actionIntervalMs;g.tick(interval-1);assert.equal(heroEvents(g).length,0);
 const saved=JSON.parse(JSON.stringify(g.state)),a=new Game(g.config,structuredClone(saved),()=>0),b=new Game(g.config,structuredClone(saved),()=>0);a.tick(1);b.tick(.5,2);assert.equal(heroEvents(a).length,1);assert.equal(heroEvents(a)[0].skillId,'heal');assert.equal(heroEvents(b).length,1);assert.deepEqual(a.state.battle.skillUseCounts,b.state.battle.skillUseCounts);assert.equal(a.character.hp,b.character.hp);
 a.tick(interval);a.tick(interval);assert.equal(a.state.battle.skillUseCounts.heal,2);assert.equal(heroEvents(a).at(-1).type,'hit');
});
test('automatic UI blocks direct manual reservation while leaving mastery controls usable',()=>{
 const g=make();g.character.hp=1;learn(g,'light-weapon-mastery',1);mode(g,true);const s=g.snapshot(),heal=s.inventory.find(i=>i.templateId==='heal'),mastery=s.inventory.find(i=>i.templateId==='light-weapon-mastery');assert.equal(skillAvailability(s,heal,0).kind,'auto');assert.equal(skillAvailability(s,heal,0).ready,false);assert.equal(skillAvailability(s,mastery,0).ready,true);mode(g,false);assert.equal(skillAvailability(g.snapshot(),heal,0).ready,true);
});
