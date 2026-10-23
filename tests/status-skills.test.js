import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync,existsSync } from 'node:fs';
import { Game } from '../src/game.js';
import { stats,attack,hitResult } from '../src/combat.js';
import { SKILL_CATALOG,skillDefinition,grantTreasureSkill } from '../src/skills.js';
import { STATUS_CATALOG,statusDefinition,initializeStatuses,applyStatus,modifiers,durationMs,clearStatuses,applyMirror,convertHit,advanceStatuses,resolveStatusEvents,nextStatusEvent,effectiveEnemy } from '../src/status-effects.js';
import { skillAvailability,skillDescription,skillIconHTML } from '../public/skills-view.js';
const config=JSON.parse(readFileSync(new URL('../config.json',import.meta.url)));
function make() {
 const g=new Game(structuredClone(config),null,()=>0);g.create({name:'상태 검증',appearanceId:'wizard'});g.state.risk=0;g.beginBattle();g.events=[];
 Object.assign(g.state.enemy,{skills:[],hp:100000,maxHp:100000,ACC:-100,DEF:0,REF:0,FOR:0,WIL:0});g.state.enemy.weapon.damageMin=g.state.enemy.weapon.damageMax=0;
 g.character.hp=20;g.refreshBattleTiming();return g;
}
function learn(g,id,slot=1){const d=skillDefinition(id),i={id:`test-${id}`,templateId:id,slot:'skill',name:d.name,stats:{}};g.character.skills.push(i);g.character.skillSlots[slot]=i.id;return i;}
const cmd=(g,id)=>({type:'USE_SKILL',characterId:g.character.id,itemId:g.character.skills.find(i=>i.templateId===id).id,battleId:g.state.battle.id,heroActionSeq:g.state.battle.combatants.hero.actionSeq});
const put=(g,actor,id,ms=15000,INT=0,source=actor)=>applyStatus(g.state.battle,actor,id,ms,{INT},source);
const ids=(g,actor)=>g.state.battle.statuses[actor].map(s=>s.id);
function drain(g,total,steps=[total],rate=1){let i=0;while(total>0){const step=Math.min(total,steps[i++%steps.length]);g.tick(step/rate,rate);total-=step;}for(let n=0;g.state.pendingGameMs>0||g.state.remaining<=1e-7;n++){assert.ok(n<1000,'bounded drain');g.tick(0);}return g;}
const records=g=>g.events.filter(e=>['hit','skill','status'].includes(e.type)).map(e=>[e.type,e.hit?.actor||e.actor,e.hit?.skillId||e.skillId,Math.round(e.hit?.combatTimeMs??e.combatTimeMs),e.hit?.damage??e.healed]);

test('28 enabled skills including 12 equipment masteries: two attacks for each defense, six inspirations, two utilities and real opaque icons',()=>{
 const enabled=SKILL_CATALOG.skills.filter(d=>d.enabled);assert.equal(enabled.length,28);assert.equal(enabled.filter(d=>d.effect.type==='status').length,6);
 for(const target of ['DEF','REF','FOR','WIL'])assert.equal(enabled.filter(d=>d.effect.statusDefense===target).length,2);
 for(const d of enabled){assert.equal(d.cooldown,undefined);assert.ok(existsSync(new URL(`../public${d.iconPath}`,import.meta.url)));assert.equal(d.perBattleLimit,d.activationMode==='toggle'?null:d.id==='heal'?2:1);}
 assert.deepEqual(enabled.filter(d=>['heal','mirror','cleanse','dispel'].includes(d.effect.type)).map(d=>d.effect.type).sort(),['heal','mirror']);
});
test('all 36 definitions apply exact one attribute +/-5, with no tier multiplication, and expose all derived modifiers',()=>{
 assert.equal(STATUS_CATALOG.statuses.length,36);assert.equal(new Set(STATUS_CATALOG.statuses.map(s=>s.id)).size,36);
 for(const def of STATUS_CATALOG.statuses){const g=make(),before=stats(g.state,g.config);put(g,'hero',def.id);const after=stats(g.state,g.config),m=modifiers(g.state.battle,'hero');
  for(const key of ['STR','CON','DEX','PER','INT','RES'])assert.equal(after[key]-before[key],key===def.attribute?(def.polarity==='buff'?5:-5):0,def.id+key);
  for(const [key,value] of Object.entries(def.modifiers))if(!key.startsWith('period'))assert.equal(m[key],value,def.id+key);
  assert.ok(after.maxHp>=1);assert.ok(after.actionIntervalMs>0);
 }
});
test('higher replaces, lower ignored, equal duration keeps longest; opposite cancels across tiers and attributes coexist',()=>{
 const g=make();put(g,'hero','strong',20000);put(g,'hero','tenacious',10000);assert.deepEqual(ids(g,'hero'),['tenacious']);assert.equal(g.state.battle.statuses.hero[0].remainingMs,10000);
 put(g,'hero','strong',90000);assert.equal(g.state.battle.statuses.hero[0].remainingMs,10000);put(g,'hero','tenacious',15000);put(g,'hero','tenacious',1000);assert.equal(g.state.battle.statuses.hero[0].remainingMs,15000);
 put(g,'hero','quick');put(g,'hero','stunned');assert.deepEqual(ids(g,'hero'),['quick']);put(g,'hero','stunned');put(g,'hero','strong');assert.deepEqual(ids(g,'hero'),['quick']);
});
test('resistance, weakness, Courageous and Terrified adjust application once, capped, and never retroactively promote existing statuses',()=>{
 const g=make(),b=g.state.battle;assert.equal(applyStatus(b,'hero','hobbled',1000,{INT:0},'enemy',{resistance:{DEX:1}}).reason,'immune');
 applyStatus(b,'hero','paralyzed',1000,{INT:0},'enemy',{resistance:{DEX:1}});assert.deepEqual(ids(g,'hero'),['immobilized']);clearStatuses(b,'hero','debuff');
 put(g,'hero','nimble');put(g,'hero','courageous');assert.ok(ids(g,'hero').includes('nimble'));put(g,'hero','aware');assert.ok(ids(g,'hero').includes('intuitive'));put(g,'hero','nimble');assert.ok(ids(g,'hero').includes('swift'));
 clearStatuses(b,'hero','buff');put(g,'hero','terrified');put(g,'hero','hobbled');assert.ok(ids(g,'hero').includes('immobilized'));put(g,'hero','blinded');assert.ok(ids(g,'hero').includes('blinded'));
});
test('all timed effects snapshot INT, Acute and hostile duration, Resolve decays both itself and other buffs at half/double game speed',()=>{
 assert.equal(durationMs(15000,4),18000);assert.equal(durationMs(15000,-100),3750);
 const g=make();put(g,'hero','acute');put(g,'enemy','enfeebled');put(g,'enemy','hobbled',10000,4,'hero');assert.equal(g.state.battle.statuses.enemy.find(s=>s.id==='hobbled').remainingMs,22500);
 clearStatuses(g.state.battle,'hero','buff');put(g,'hero','resolute',10000);put(g,'hero','quick',10000);advanceStatuses(g.state.battle,1000);assert.equal(g.state.battle.statuses.hero[0].remainingMs,9500);assert.equal(g.state.battle.statuses.hero[1].remainingMs,9500);
 put(g,'hero','frightened');put(g,'hero','frightened');advanceStatuses(g.state.battle,1000);assert.equal(g.state.battle.statuses.hero.find(s=>s.id==='quick').remainingMs,7500);
});
test('all eight attacks use DEF then their status defense and bonuses, consume once on execution, apply only on hit/crit, replace the normal attack',()=>{
 for(const def of SKILL_CATALOG.skills.filter(s=>s.effect.type==='attack'))for(const roll of [1,20]){
  const g=make();learn(g,def.id);g.rng=n=>n===20?roll-1:0;const baseAcc=stats(g.state,g.config).ACC;g.command(cmd(g,def.id));assert.equal(g.state.battle.skillUseCounts[def.id],undefined);assert.throws(()=>g.command(cmd(g,def.id)),/이미/);
  g.battleAction('hero');const hit=g.state.battle.lastHit;assert.equal(hit.target,'DEF');if(hit.statusCheck)assert.equal(hit.statusCheck.target,def.effect.statusDefense);assert.equal(hit.skillId,def.id);assert.equal(hit.calculation.acc,baseAcc+def.effect.accuracyBonus);assert.equal(g.events.filter(e=>e.type==='hit').length,1);assert.equal(g.state.battle.skillUseCounts[def.id],1);
  assert.equal(ids(g,'enemy').includes(def.effect.statusId),hit.tier>=2);assert.equal(g.state.battle.pendingSkill,undefined);assert.equal(g.state.battle.combatants.hero.actionSeq,1);
  assert.throws(()=>g.command(cmd(g,def.id)),/소진/);
 }
});
test('one original hit tier converts at most one step; defensive downgrade takes priority, probabilities respect thresholds',()=>{
 const hit={tier:2};assert.equal(convertHit(hit,{outgoingHitToCrit:1},{incomingHitToGraze:1},()=>0).tier,1);
 assert.equal(convertHit({tier:1},{outgoingGrazeToHit:1,outgoingHitToCrit:1},{incomingHitToCrit:1},()=>0).tier,2);
 for(const tier of [0,3])assert.equal(convertHit({tier},{outgoingHitToCrit:1,outgoingGrazeToHit:1},{incomingHitToGraze:1},()=>0).tier,tier);
 assert.equal(convertHit(hit,{}, {incomingHitToGraze:.25},()=>249999).tier,1);assert.equal(convertHit(hit,{}, {incomingHitToGraze:.25},()=>250000).tier,2);
 const result=attack({roll:10,acc:10,defense:10,str:0,base:10,pen:0,ar:0,skillDamageMultiplier:1.25,transformHit:h=>convertHit(h,{outgoingHitToCrit:1},{},()=>0)});assert.equal(result.damage,18);assert.equal(result.originalTier,2);
});
test('all six inspiration skills apply at next action, INT uses pre-cast stats; Resolve promotes later casts to tier three',()=>{
 for(const def of SKILL_CATALOG.skills.filter(s=>s.effect.type==='status')){const g=make();g.character.attributes.INT=4;learn(g,def.id);g.command(cmd(g,def.id));assert.deepEqual(ids(g,'hero'),[]);g.battleAction('hero');assert.ok(ids(g,'hero').includes(def.effect.statusId));assert.equal(g.state.battle.statuses.hero[0].remainingMs,36000);assert.equal(g.events.filter(e=>e.type==='hit').length,0);}
 const g=make();learn(g,'resolve-inspiration');learn(g,'intellect-inspiration',2);g.command(cmd(g,'resolve-inspiration'));g.battleAction('hero');g.command(cmd(g,'intellect-inspiration'));g.battleAction('hero');assert.ok(ids(g,'hero').includes('brilliant'));
});
test('mirror lasts INT-adjusted time, loses ten only on incoming hit/crit, and expires after three incoming hits',()=>{
 const g=make();g.character.attributes.INT=4;learn(g,'mirrored-image');g.command(cmd(g,'mirrored-image'));g.battleAction('hero');assert.equal(stats(g.state,g.config).DEF,40);assert.equal(g.state.battle.statuses.hero[0].remainingMs,72000);
 g.battleAction('enemy');assert.equal(stats(g.state,g.config).DEF,40);g.state.enemy.ACC=100;g.rng=n=>n-1;
 for(const value of [30,20,10]){g.battleAction('enemy');assert.equal(stats(g.state,g.config).DEF,value);}assert.deepEqual(ids(g,'hero'),[]);
});
test('charm cancels queued skill with no cost and rejects manual character controls; domination attacks self only',()=>{
 const g=make();g.command(cmd(g,'heal'));put(g,'hero','charmed');assert.throws(()=>g.command(cmd(g,'heal')),/매혹/);assert.throws(()=>g.command({type:'ALLOCATE_STAT',characterId:g.character.id,stat:'STR'}),/매혹/);g.battleAction('hero');assert.equal(g.state.battle.skillUseCounts.heal,undefined);assert.equal(g.state.battle.lastHit.targetActor,'enemy');assert.equal(g.state.battle.pendingSkill,undefined);
 put(g,'hero','dominated');g.rng=n=>n-1;const hp=g.state.enemy.hp;g.battleAction('hero');assert.equal(g.state.battle.lastHit.targetActor,'hero');assert.equal(g.state.enemy.hp,hp);
 const h=make();put(h,'enemy','dominated');h.state.enemy.ACC=100;h.state.enemy.weapon.damageMin=h.state.enemy.weapon.damageMax=10;h.rng=n=>n-1;const heroHp=h.character.hp,enemyHp=h.state.enemy.hp;h.battleAction('enemy');assert.equal(h.character.hp,heroHp);assert.ok(h.state.enemy.hp<enemyHp);
});
test('Energized crit resets only target readiness; Swift prevents interrupt, not damage',()=>{
 for(const immune of [false,true]){const g=make();put(g,'hero','energized');if(immune)put(g,'enemy','swift');g.state.battle.combatants.enemy.readiness=.8;g.rng=n=>n-1;g.battleAction('hero');assert.equal(g.state.battle.combatants.enemy.readiness,immune?.8:0);assert.equal(!!g.state.battle.lastHit.interrupted,!immune);}
});
test('healing reduction/block affects direct healing and Robust; Brilliant restores only depleted equipped skills without exceeding limit',()=>{
 for(const [id,rate] of [['sickened',.75],['weakened',.5],['enfeebled',0]]){const g=make();put(g,'hero',id);g.character.hp=1;const expected=Math.floor(Math.floor(stats(g.state,g.config).maxHp*.1)*rate);if(!expected)assert.throws(()=>g.command(cmd(g,'heal')),/회복/);else{g.command(cmd(g,'heal'));g.battleAction('hero');assert.equal(g.character.hp,1+expected);}}
 const g=make();put(g,'hero','robust',10000);g.tick(3000);assert.equal(g.character.hp,30);g.tick(3000);assert.equal(g.character.hp,40);
 const h=make();put(h,'hero','brilliant',14000);h.state.battle.skillUseCounts.heal=1;h.tick(6000);assert.equal(h.state.battle.skillUseCounts.heal,0);h.tick(6000);assert.equal(h.state.battle.skillUseCounts.heal,0);
});
test('CON expiry clamps without healing, negative stats are finite, and derived enemy defenses use same attribute deltas',()=>{
 const g=make();put(g,'hero','fit',1000);g.character.hp=60;g.tick(1000);assert.equal(g.character.hp,50);put(g,'hero','fit',1000);assert.equal(g.character.hp,50);
 const before=effectiveEnemy(g.state.enemy,g.state.battle,g.config);put(g,'enemy','distracted');const after=effectiveEnemy(g.state.enemy,g.state.battle,g.config);assert.equal(after.PER,before.PER-5);assert.equal(after.ACC,before.ACC-5);assert.equal(after.REF,before.REF-10);assert.equal(after.DEF,before.DEF-10);
});
test('saved timers and periodic phases produce identical online/offline, irregular and budget-limited outcomes',()=>{
 const g=make();put(g,'hero','resolute',12000);put(g,'hero','robust',10000);put(g,'hero','brilliant',10000);put(g,'enemy','hobbled',7500);g.state.battle.skillUseCounts.heal=1;
 const saved=structuredClone(g.state),runs=[[50],[200],[13,1777,22,10000],[18000]].map(p=>drain(new Game(g.config,structuredClone(saved),()=>0),18000,p));runs.push(drain(new Game(g.config,structuredClone(saved),()=>0),18000,[200],2));
 const limited=new Game({...g.config,actionSpeed:{...g.config.actionSpeed,maxEventsPerTick:1}},structuredClone(saved),()=>0);limited.tick(18000);const restored=new Game(limited.config,JSON.parse(JSON.stringify(limited.state)),()=>0);restored.events=limited.events;runs.push(drain(restored,0));
 for(const h of runs.slice(1)){assert.deepEqual(records(h),records(runs[0]));assert.equal(h.character.hp,runs[0].character.hp);assert.deepEqual(JSON.parse(JSON.stringify(h.state.battle.statuses,(_k,v)=>typeof v==='number'?Math.round(v*1e6)/1e6:v)),JSON.parse(JSON.stringify(runs[0].state.battle.statuses,(_k,v)=>typeof v==='number'?Math.round(v*1e6)/1e6:v)));}
});
test('expiry wins periodic/action ties and a zero-time event survives the event budget without allowing stale commands',()=>{
 const g=make();put(g,'hero','robust',3000);g.tick(3000);assert.equal(g.character.hp,20);assert.deepEqual(ids(g,'hero'),[]);
 const h=make();h.config.actionSpeed.maxEventsPerTick=1;put(h,'hero','quick',2200);h.tick(1760);assert.equal(h.state.battle.combatants.hero.actionSeq,1);
});
test('battle exit, death and restored ended battle discard statuses and pending reservations',()=>{
 for(const finish of [g=>g.reward('victory'),g=>g.phase('DOWNED',1000),g=>g.beginBattle()]){const g=make();put(g,'hero','quick');g.command(cmd(g,'heal'));finish(g);assert.equal(g.state.battle?.pendingSkill,undefined);assert.equal(g.state.battle?.statuses?.hero.length||0,0);}
 const g=make();put(g,'hero','quick');g.character.hp=0;const restored=new Game(g.config,structuredClone(g.state));assert.deepEqual(ids(restored,'hero'),[]);
});
test('skill-category treasure grants every unlearned skill exactly once to the account, no sale or implicit equip; all learned falls back to gold',()=>{
 const g=make();g.config.probabilities={dropPercent:100,weaponWeight:0,armorWeight:0,charmWeight:0,skillWeight:1};g.phase('HOME',1000);const other=g.create({name:'다른 모험가',appearanceId:'warrior'});g.selectCharacter(g.state.characters[0].id);const slots=structuredClone(g.character.skillSlots);
 for(let i=0;i<27;i++){g.reward('treasure');assert.ok(g.state.lastReward.skillId);assert.equal(g.state.lastReward.goldOnly,false);}
 assert.equal(g.character.skills.length,28);assert.equal(new Set(g.character.skills.map(i=>i.templateId )).size,28);assert.deepEqual(g.character.skillSlots,slots);assert.equal(other.skills.length,28);assert.deepEqual(other.skills,g.character.skills);
 const gold=g.state.gold;g.reward('treasure');assert.equal(g.state.lastReward.goldOnly,true);assert.equal(g.character.skills.length,28);assert.ok(g.state.gold>gold);const restored=new Game(g.config,JSON.parse(JSON.stringify(g.state)));assert.equal(restored.character.skills.length,28);
});
test('new monsters receive a limited skill, use it on third action, then return to basic attacks; saved old enemies are not granted abilities',()=>{
 const g=make();g.state.enemy.skills=['weakening-strike'];g.state.enemy.ACC=100;g.rng=n=>n-1;for(let i=0;i<4;i++)g.battleAction('enemy');const hits=g.events.filter(e=>e.type==='hit');assert.deepEqual(hits.map(e=>e.hit.skillId),[undefined,undefined,'weakening-strike',undefined]);assert.equal(g.state.battle.enemySkillUseCounts['weakening-strike'],1);assert.ok(ids(g,'hero').includes('weakened'));
 const h=make();delete h.state.enemy.skills;const saved=new Game(h.config,structuredClone(h.state));assert.equal(saved.state.enemy.skills,undefined);h.beginBattle();assert.ok(h.state.enemy.skills.length>0);
});
test('UI shows real icon and skill defense/duration, no cooldown, and disables controlled actions',()=>{
 const g=make();learn(g,'hamstring');let s=g.snapshot(),item=s.inventory.find(i=>i.templateId==='hamstring');assert.match(skillDescription(item),/FOR/);assert.match(skillDescription(item),/15.0초\(INT\)/);assert.doesNotMatch(skillDescription(item),/재사용|undefined/);assert.match(skillIconHTML(item),/<img src="\/assets\/skills\/hamstring-v1.webp"/);
 put(g,'hero','charmed');s=g.snapshot();assert.equal(skillAvailability(s,item,0).ready,false);
});


test('attack duration preview includes Acute and Enfeebled and matches actual snapshotted duration',()=>{
 const g=make();learn(g,'hamstring');put(g,'hero','acute');put(g,'enemy','enfeebled');g.character.attributes.INT=4;g.state.enemy.RES=10;put(g,'enemy','shaken');g.rng=n=>n-1;
 const preview=g.snapshot().inventory.find(i=>i.templateId==='hamstring').durationMs;
 g.command(cmd(g,'hamstring'));g.battleAction('hero');assert.equal(g.state.battle.statuses.enemy.find(s=>s.id==='hobbled').remainingMs,preview);
});


test('monster CON status rounds the full HP formula once and retains flat HP bonuses',()=>{
 const g=make();Object.assign(g.state.enemy,{CON:1,maxHp:52,statusHpBase:50});put(g,'enemy','fit');assert.equal(effectiveEnemy(g.state.enemy,g.state.battle,g.config).maxHp,65);
 g.state.enemy.maxHp=62;assert.equal(effectiveEnemy(g.state.enemy,g.state.battle,g.config).maxHp,75);clearStatuses(g.state.battle,'enemy','buff');put(g,'enemy','sickened');assert.equal(effectiveEnemy(g.state.enemy,g.state.battle,g.config).maxHp,50);
});

test('Resolve scales all 18 afflictions, allows negatives and caps reduction at 75%, without shortening inspirations or mirror',()=>{
 for(const RES of [-5,0,5,25,100])for(const def of STATUS_CATALOG.statuses){
  const b={};applyStatus(b,'hero',def.id,10000,{INT:4},'enemy',{},'test',{RES});
  const expected=12000*(def.polarity==='debuff'?Math.max(.25,1-.03*RES):1);
  assert.ok(Math.abs(b.statuses.hero[0].remainingMs-expected)<1e-8,`${def.id} RES ${RES}`);
 }
 const b={};applyMirror(b,'hero',10000,{INT:4,RES:100});assert.equal(b.statuses.hero[0].remainingMs,12000);
 applyStatus(b,'enemy','enfeebled',10000,{INT:0},'hero');applyStatus(b,'hero','acute',10000,{INT:0});
 applyStatus(b,'enemy','hobbled',10000,{INT:4},'hero',{},'hamstring',{RES:5});
 assert.equal(b.statuses.enemy.find(s=>s.id==='hobbled').remainingMs,19125);
});
test('hero and monster attacks use recipient effective Resolve including gear and existing debuffs',()=>{
 for(const actor of ['hero','enemy']){
  const g=make();g.rng=n=>n-1;g.character.attributes.RES=8;g.character.attributes.INT=4;
  g.state.inventory.find(i=>i.id===g.character.equipment.armor).stats.RES=2;
  Object.assign(g.state.enemy,{RES:10,INT:4,ACC:100,skills:['hamstring']});
  const target=actor==='hero'?'enemy':'hero';put(g,target,'shaken');
  if(actor==='hero'){learn(g,'hamstring');g.command(cmd(g,'hamstring'));}else g.state.battle.combatants.enemy.actionSeq=2;
  g.battleAction(actor);
  const status=g.state.battle.statuses[target].find(s=>s.id==='hobbled');assert.ok(status,actor);assert.equal(status.remainingMs,15300,actor);
 }
});
test('Resolve is sampled on execution before the new Resolve debuff and does not rescale existing or restored timers',()=>{
 const g=make();g.rng=n=>n-1;g.character.attributes.INT=0;g.state.enemy.RES=0;learn(g,'dread-whisper');g.command(cmd(g,'dread-whisper'));
 g.state.enemy.RES=10;g.battleAction('hero');const entry=g.state.battle.statuses.enemy.find(s=>s.id==='frightened');assert.ok(entry);
 assert.equal(entry.remainingMs,skillDefinition('dread-whisper').effect.durationMs*.7);
 g.state.enemy.RES=100;g.refreshBattleTiming();assert.equal(entry.remainingMs,10500);
 const restored=new Game(g.config,JSON.parse(JSON.stringify(g.state)),()=>0);assert.equal(restored.state.battle.statuses.enemy.find(s=>s.id==='frightened').remainingMs,10500);
 const online=new Game(g.config,structuredClone(g.state),()=>0),offline=new Game(g.config,structuredClone(g.state),()=>0);
 online.tick(200,1);offline.tick(100,2);assert.deepEqual(online.state.battle.statuses,offline.state.battle.statuses);assert.equal(online.state.battle.statuses.enemy.find(s=>s.id==='frightened').remainingMs,10300);
});
test('Resolve-adjusted reapplication keeps the longest time and preserves resistance and cancellation',()=>{
 const b={};const apply=(RES,base=10000)=>applyStatus(b,'hero','hobbled',base,{INT:0},'enemy',{},'hamstring',{RES});
 apply(0);apply(20);assert.equal(b.statuses.hero[0].remainingMs,10000);apply(-5);assert.equal(b.statuses.hero[0].remainingMs,11500);assert.equal(b.statuses.hero[0].durationMs,11500);
 applyStatus(b,'hero','quick',10000,{INT:0},'hero',{},'dexterity-inspiration',{RES:100});assert.equal(b.statuses.hero.length,0);
 assert.equal(applyStatus(b,'hero','hobbled',10000,{INT:0},'enemy',{resistance:{DEX:1}},'hamstring',{RES:-5}).reason,'immune');assert.equal(b.statuses.hero.length,0);
});
