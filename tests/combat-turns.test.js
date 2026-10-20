import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Game} from '../src/game.js';
import {stats,attack} from '../src/combat.js';
import {EQUIPMENT_CATALOG as catalog,generateEquipment,weaponDefense} from '../src/equipment.js';
const config=JSON.parse(readFileSync(new URL('../config.json',import.meta.url)));
const item=(id,specials=false)=>generateEquipment({slot:catalog.weapons.some(w=>w.id===id)?'weapon':'armor',templateId:id,gradeId:'normal',rng:()=>0,specials});
function make(cls='warrior',first='hero',INT){
 const c=structuredClone(config);c.initiative.tieWinner=first;
 const g=new Game(c,null,n=>Math.min(11,n-1));g.create({name: '모험가', appearanceId: cls});g.state.homePaused=false;if(INT!==undefined)g.character.attributes.INT=INT;g.state.risk=0;g.beginBattle();g.state.enemy.hp=g.state.enemy.maxHp=100000;g.state.enemy.weapon.damageMin=g.state.enemy.weapon.damageMax=0;return g;
}
test('15 category targets are identical for both classes and independent of added type',()=>{
 const expected={dagger:'REF',shortsword:'DEF',longsword:'DEF',rapier:'REF',greatsword:'DEF',handaxe:'DEF',battleaxe:'DEF',mace:'FOR',warhammer:'FOR',spear:'REF',halberd:'DEF','fire-staff':'WIL','ice-staff':'WIL','lightning-staff':'WIL','corrosion-staff':'WIL'};
 for(const cls of ['warrior','wizard'])for(const t of catalog.weapons)for(const special of [false,true]){
  const g=make(cls),w=item(t.id,special);g.state.inventory.push(w);g.command({characterId: g.character?.id, type:'EQUIP',itemId:w.id});g.battleAction('hero');assert.equal(g.state.battle.lastHit.target,expected[t.id]);assert.equal(w.hitDefense,expected[t.id]);assert.equal(w.classId,undefined);
 }
 assert.equal(weaponDefense({icon:'staff',classId:'warrior'}),'WIL');assert.equal(weaponDefense({icon:'sword',classId:'wizard'}),'DEF');
});
