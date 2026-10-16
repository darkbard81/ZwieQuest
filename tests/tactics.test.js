import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Game} from '../src/game.js';
import {stats,attack} from '../src/combat.js';
import {EQUIPMENT_CATALOG as catalog,generateEquipment,weaponDefense} from '../src/equipment.js';
import {tacticEffect,availableTactics} from '../src/tactics.js';
import {roundStatus,tacticDescription} from '../public/tactics-view.js';
const config=JSON.parse(readFileSync(new URL('../config.json',import.meta.url)));
const item=(id,specials=false)=>generateEquipment({slot:catalog.weapons.some(w=>w.id===id)?'weapon':'armor',templateId:id,gradeId:'normal',rng:()=>0,specials});
function make(cls='warrior',tactic='normal',first='hero',INT){
 const c=structuredClone(config);c.initiative.enemyDEX=first==='hero'?-10:10;if(INT!==undefined)c.classes[cls].base.INT=INT;
 const g=new Game(c,null,n=>Math.min(11,n-1));g.create(cls);g.state.risk=0;g.state.tactic=tactic;g.beginBattle();g.state.enemy.hp=g.state.enemy.maxHp=100000;g.state.enemy.base=1;return g;
}
function finishRound(g){const round=g.state.battle.turn;let guard=0;while(g.state.battle.turn===round&&guard++<10)g.battleAction();assert.ok(guard<=6);}
const hits=g=>g.events.filter(e=>e.type==='hit').map(e=>e.hit);

test('15 category targets are identical for both classes and independent of added type',()=>{
 const expected={dagger:'REF',shortsword:'DEF',longsword:'DEF',rapier:'REF',greatsword:'DEF',handaxe:'DEF',battleaxe:'DEF',mace:'FOR',warhammer:'FOR',spear:'REF',halberd:'DEF','fire-staff':'WIL','ice-staff':'WIL','lightning-staff':'WIL','corrosion-staff':'WIL'};
 for(const cls of ['warrior','wizard'])for(const t of catalog.weapons)for(const special of [false,true]){
  const g=make(cls),w=item(t.id,special);g.state.inventory.push(w);g.command({type:'EQUIP',itemId:w.id});g.battleAction();assert.equal(g.state.battle.lastHit.target,expected[t.id]);assert.equal(w.hitDefense,expected[t.id]);assert.equal(w.classId,undefined);
 }
 assert.equal(weaponDefense({icon:'staff',classId:'warrior'}),'WIL');assert.equal(weaponDefense({icon:'sword',classId:'wizard'}),'DEF');
});
test('class switch preserves equipped weapon/armor, changes only available class tactics',()=>{
 const g=make('warrior','defend');g.phase('HOME',10000);const w=item('fire-staff'),a=item('plate');g.state.inventory.push(w,a);g.command({type:'EQUIP',itemId:w.id});g.command({type:'EQUIP',itemId:a.id});const count=g.state.inventory.length,gear={...g.state.equipment};
 g.command({type:'CLASS',classId:'wizard'});assert.deepEqual(g.state.equipment,gear);assert.equal(g.state.inventory.length,count);assert.equal(g.state.tactic,'normal');assert.deepEqual(g.snapshot().availableTactics.map(t=>t.id),['normal','heal','burst']);
 for(const cls of ['warrior','wizard']){const h=make(cls);for(const id of ['normal','defend','assault','heal','burst']){const allowed=availableTactics(cls,config).some(t=>t.id===id);if(allowed)h.command({type:'TACTIC',tactic:id});else assert.throws(()=>h.command({type:'TACTIC',tactic:id}));}}
 const old={id:'old',slot:'weapon',icon:'staff',classId:'wizard',stats:{PEN:2,power:0}};g.state.inventory.push(old);g.command({type:'CLASS',classId:'warrior'});g.command({type:'EQUIP',itemId:old.id});assert.equal(g.state.equipment.weapon,old.id);
});
test('ordinary round has exactly three attacks per actor, correct penalties, no AP carry',()=>{
 for(const first of ['hero','enemy']){const g=make('warrior','normal',first);g.events=[];finishRound(g);const h=hits(g);assert.equal(h.length,6);assert.deepEqual(h.map(x=>x.actor),[...Array(3).fill(first),...Array(3).fill(first==='hero'?'enemy':'hero')]);for(const actor of ['hero','enemy']){const a=h.filter(h=>h.actor===actor);assert.deepEqual(a.map(h=>h.cost),[1,1,1]);assert.deepEqual(a.map(h=>h.margin-a[0].margin),[0,-5,-10]);}assert.equal(g.state.battle.ap,3);assert.equal(g.state.battle.turn,2);assert.equal(g.state.battle.attacks,0);}
});
test('defense reserves exactly two hero AP and protects before enemy initiative, no stacking',()=>{
 for(const first of ['hero','enemy']){const g=make('warrior','defend',first);const base=stats(g.state,g.config).AR;assert.equal(g.state.battle.heroReservedAP,2);assert.equal(g.snapshot().combatStats.AR,base+2);g.events=[];finishRound(g);assert.equal(hits(g).filter(h=>h.actor==='hero').length,1);for(const h of hits(g).filter(h=>h.actor==='enemy'))assert.equal(h.ar,base+2);assert.equal(g.state.battle.roundEffects.AR,2);assert.equal(g.state.battle.ap,first==='hero'?1:3);g.command({type:'TACTIC',tactic:'normal'});finishRound(g);assert.deepEqual(g.state.battle.roundEffects,{});assert.equal(g.snapshot().combatStats.AR,base);assert.equal(g.state.battle.ap,3);}
});
test('assault uses an action without attack penalty, buff expires at round boundary',()=>{
 const g=make('warrior','assault');g.events=[];g.battleAction();assert.equal(g.state.battle.ap,1);assert.equal(g.state.battle.attacks,0);assert.equal(hits(g).length,0);assert.equal(g.snapshot().combatStats.ACC,stats(g.state,g.config).ACC+4);
 g.command({type:'TACTIC',tactic:'normal'});assert.equal(g.state.battle.roundTactic,'assault');g.battleAction();const h=hits(g)[0];assert.equal(h.margin,12+stats(g.state,g.config).ACC+4-(10+g.state.enemy.DEF));assert.equal(g.state.battle.actor,'enemy');finishRound(g);assert.deepEqual(g.state.battle.roundEffects,{});assert.equal(g.state.battle.roundTactic,'normal');
});
test('heal costs 2 AP at own turn, respects max HP, and has base effect for zero/negative INT',()=>{
 for(const INT of [-3,0,3]){const g=make('wizard','heal','enemy',INT);const max=stats(g.state,g.config).maxHp;g.state.hp=max-4;g.events=[];for(let i=0;i<3;i++)g.battleAction();const before=g.state.hp;assert.equal(g.events.filter(e=>e.tacticId==='heal').length,0);g.battleAction();assert.equal(g.state.hp,Math.min(max,before+12+Math.max(0,INT)*4));assert.equal(g.state.battle.ap,1);assert.equal(g.state.battle.attacks,0);g.battleAction();assert.equal(hits(g).filter(h=>h.actor==='hero').length,1);assert.equal(g.state.battle.turn,2);}
});
test('burst multiplies grade damage once, is consumed on hit and miss, adds no PEN or target changes',()=>{
 for(const miss of [false,true]){const g=make('wizard','burst');const w=item('longsword');w.damageRate=.3;g.state.inventory.push(w);g.command({type:'EQUIP',itemId:w.id});g.battleAction();assert.ok(Math.abs(g.state.battle.roundEffects.damageRate-1.3)<1e-9);g.state.enemy.DEF=miss?999:3;g.battleAction();const h=hits(g).at(-1);assert.equal(h.target,'DEF');assert.equal(h.pen,w.stats.PEN);assert.equal(h.tacticDamageRate,1.3);assert.equal(h.damage,miss?0:Math.floor(h.base*1.3*2.3*h.multiplier));assert.equal(g.state.battle.roundEffects.damageRate,undefined);g.command({type:'TACTIC',tactic:'normal'});finishRound(g);g.battleAction();assert.equal(hits(g).at(-1).tacticDamageRate,0);}
});
test('every class tactic works at INT=0; INT changes only tactic effects, not base damage',()=>{
 assert.deepEqual(tacticEffect('defend',0,config),{AR:2});assert.deepEqual(tacticEffect('assault',0,config),{ACC:4});assert.deepEqual(tacticEffect('heal',0,config),{heal:12});assert.deepEqual(tacticEffect('burst',0,config),{damageRate:1});assert.deepEqual(tacticEffect('defend',3,config),{AR:3});
 const a=make('wizard','normal','hero',0),b=make('wizard','normal','hero',3);a.battleAction();b.battleAction();assert.equal(hits(a).at(-1).damage,hits(b).at(-1).damage);
 for(const id of ['defend','assault','heal','burst'])assert.deepEqual(tacticEffect(id,-9,config),tacticEffect(id,0,config));
});
test('DEX penalty affects REF and initiative, not ACC or other stats; negatives are allowed',()=>{
 for(const cls of ['warrior','wizard']){const g=make(cls);delete g.state.equipment.armor;const base=stats(g.state,g.config);const a=item('plate');g.state.inventory.push(a);g.command({type:'EQUIP',itemId:a.id});const after=stats(g.state,g.config);assert.equal(after.DEX,base.DEX-3);assert.equal(after.REF,base.REF-3);for(const k of ['ACC','DEF','FOR','WIL','STR','INT','CON','RES','PER','PEN','AP'])assert.equal(after[k],base[k]);g.config.initiative.enemyDEX=0;g.beginBattle();assert.equal(g.state.battle.firstActor,'enemy');}
});
test('existing armor DEX migrates once without changing other saved fields or item IDs',()=>{
 const g=make();const originals=catalog.armors.map(t=>{const a=item(t.id);delete a.stats.DEX;delete a.dexRulesVersion;return a;});originals.push({id:'coat',slot:'armor',name:'수호자의 외투',stats:{AR:4,HP:8},value:40});g.state.inventory.push(...originals);const old=JSON.parse(JSON.stringify(g.state));old.tactic='pierce';delete old.combatRulesVersion;delete old.battle.rulesVersion;old.battle.ap=2;old.battle.attacks=1;
 const restored=new Game(config,old);assert.equal(restored.state.tactic,'normal');assert.equal(restored.state.battle.ap,2);assert.equal(restored.state.battle.attacks,1);assert.equal(restored.state.battle.roundTactic,'normal');
 for(const orig of originals){const a=restored.state.inventory.find(i=>i.id===orig.id),expected=catalog.armors.find(t=>t.id===a.templateId)?.DEX||0;assert.equal(a.stats.DEX,expected);const clean=structuredClone(a);delete clean.stats.DEX;delete clean.dexRulesVersion;assert.deepEqual(clean,orig);}
 const again=new Game(config,structuredClone(restored.state));assert.deepEqual(again.state,restored.state);
});
test('reload mid-round preserves reserved AP and already-used burst/heal without repeating them',()=>{
 for(const [cls,tactic,first] of [['warrior','defend','enemy'],['warrior','assault','hero'],['wizard','heal','hero'],['wizard','burst','hero']]){
  const g=make(cls,tactic,first);g.state.hp=30;if(tactic!=='defend')g.battleAction();const s=JSON.parse(JSON.stringify(g.state));const r=new Game(g.config,s,n=>Math.min(11,n-1));assert.deepEqual(r.state.battle,g.state.battle);assert.equal(r.state.hp,30+(tactic==='heal'?24:0));const ap=r.state.battle.ap;r.events=[];r.battleAction();assert.equal(r.events.some(e=>e.type==='tactic'),false);if(tactic==='burst')assert.equal(hits(r)[0].tacticDamageRate,1.3);if(tactic==='defend')assert.equal(r.state.battle.ap,ap-1);
 }
});
test('Raw still ignores burst/STR/AR, and UI distinguishes current and next-round tactics',()=>{
 const r=attack({roll:20,acc:50,defense:0,str:999,base:999,damageRate:10,tacticDamageRate:10,pen:999,ar:999,damageTypes:['raw'],fixedDamage:7});assert.equal(r.damage,7);
 const g=make('warrior','defend');g.command({type:'TACTIC',tactic:'assault'});assert.match(roundStatus(g.snapshot()),/적용 방어태세/);assert.match(roundStatus(g.snapshot()),/다음: 공격태세/);assert.match(tacticDescription(g.snapshot().availableTactics.find(t=>t.id==='defend')),/2 AP 예약/);
});
