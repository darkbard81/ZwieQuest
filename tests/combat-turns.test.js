import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Game} from '../src/game.js';
import {stats,attack} from '../src/combat.js';
import {EQUIPMENT_CATALOG as catalog,generateEquipment,weaponDefense} from '../src/equipment.js';
const config=JSON.parse(readFileSync(new URL('../config.json',import.meta.url)));
const item=(id,specials=false)=>generateEquipment({slot:catalog.weapons.some(w=>w.id===id)?'weapon':'armor',templateId:id,gradeId:'normal',rng:()=>0,specials});
function make(cls='warrior',first='hero',INT){
 const c=structuredClone(config);c.initiative.enemyDEX=first==='hero'?-10:10;if(INT!==undefined)c.classes[cls].base.INT=INT;
 const g=new Game(c,null,n=>Math.min(11,n-1));g.create(cls);g.state.risk=0;g.beginBattle();g.state.enemy.hp=g.state.enemy.maxHp=100000;g.state.enemy.base=1;return g;
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
test('ordinary round has exactly three attacks per actor, correct penalties, no AP carry',()=>{
 for(const first of ['hero','enemy']){const g=make('warrior',first);g.events=[];finishRound(g);const h=hits(g);assert.equal(h.length,6);assert.deepEqual(h.map(x=>x.actor),[...Array(3).fill(first),...Array(3).fill(first==='hero'?'enemy':'hero')]);for(const actor of ['hero','enemy']){const a=h.filter(h=>h.actor===actor);assert.deepEqual(a.map(h=>h.cost),[1,1,1]);assert.deepEqual(a.map(h=>h.margin-a[0].margin),[0,-5,-10]);}assert.equal(g.state.battle.ap,3);assert.equal(g.state.battle.turn,2);assert.equal(g.state.battle.attacks,0);}
});
test('DEX penalty affects REF and initiative, not ACC or other stats; negatives are allowed',()=>{
 for(const cls of ['warrior','wizard']){const g=make(cls);delete g.state.equipment.armor;const base=stats(g.state,g.config);const a=item('plate');g.state.inventory.push(a);g.command({type:'EQUIP',itemId:a.id});const after=stats(g.state,g.config);assert.equal(after.DEX,base.DEX-3);assert.equal(after.REF,base.REF-3);for(const k of ['ACC','DEF','FOR','WIL','STR','INT','CON','RES','PER','PEN','AP'])assert.equal(after[k],base[k]);g.config.initiative.enemyDEX=0;g.beginBattle();assert.equal(g.state.battle.firstActor,'enemy');}
});
