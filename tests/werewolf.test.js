import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MONSTER_CATALOG, ENCOUNTER_CONFIG, eligibleVariations, eligibleBossVariations, generateMonster } from '../src/monsters.js';
import { losslessWebpInfo } from './helpers/webp.js';
const pool=eligibleVariations('old_forest');
const wolves=pool.filter(p=>p.monster.id==='werewolf');
const spawn=(id,level=0)=>{let draw=0;return generateMonster('old_forest',()=>[pool.findIndex(p=>p.variation.id===id),level,0][draw++]??0);};
test('seven Werewolf variants use strength/perception, 10–20 base weapon damage and forest-only encounters',()=>{
 assert.equal(wolves.length,7);
 assert.deepEqual(wolves.map(p=>p.variation.weapon.damageTypes[0]),['slash','pierce','blunt','fire','cold','lightning','corrosion']);
 const arachne=MONSTER_CATALOG.find(m=>m.id==='arachne');
 for(const {monster,variation} of wolves){
  assert.equal(monster.codexOrder,60);assert.equal(monster.A.STR,6);assert.equal(monster.A.PER,6);
  assert.ok(monster.A.STR>arachne.A.STR);assert.ok(monster.A.PER>arachne.A.PER);assert.ok(monster.A.DEX<arachne.A.DEX);
  for(const offset of [0,5]){
   const e=spawn(variation.id,offset);assert.equal(e.monsterId,'werewolf');assert.equal(e.level,10+offset);
   assert.equal(e.PER,6);assert.equal(e.DEX,2);assert.equal(e.CON,3);assert.deepEqual(e.skills,['weakening-strike']);
   assert.equal(e.weapon.damageMin,10);assert.equal(e.weapon.damageMax,20);assert.equal(e.weapon.hitDefense,'DEF');
  }
  for(const [path,size] of [[variation.img_path,512],[variation.icon_path,128]]){
   const info=losslessWebpInfo(readFileSync(new URL('../'+path,import.meta.url)));assert.deepEqual([info.width,info.height],[size,size]);assert.equal(info.alpha,true);
  }
 }
 for(const id of Object.keys(ENCOUNTER_CONFIG.regions).filter(id=>id!=='old_forest'))assert.ok(eligibleVariations(id).every(p=>p.monster.id!=='werewolf'));
 assert.deepEqual(eligibleBossVariations('old_forest').map(p=>p.variation.id),['corrosion_arachne']);
});
