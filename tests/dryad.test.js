import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { MONSTER_CATALOG, eligibleVariations, generateMonster } from '../src/monsters.js';
import { monsterAssetURL } from '../public/monster-assets.js';
import { losslessWebpInfo } from './helpers/webp.js';
const manifest=JSON.parse(readFileSync(new URL('../docs/dryad-assets.json',import.meta.url)));
const pool=eligibleVariations('old_forest');
const dryad=MONSTER_CATALOG.find(m=>m.id==='dryad');
const spawn=(id,level=0,allocation=0)=>{let draw=0;return generateMonster('old_forest',()=>[pool.findIndex(p=>p.variation.id===id),level,0][draw++]??allocation);};
test('seven Dryads preserve source mapping, distinct artwork and transparent lossless runtime assets',()=>{
 assert.equal(manifest.originalUnmodified,true);assert.equal(manifest.originals.length,7);
 for(const key of ['shareUrl','sha256','rgbaSha256'])assert.equal(new Set(manifest.originals.map(e=>e[key])).size,7);
 assert.match(manifest.originals.find(e=>e.damageType==='blunt').shareUrl,/m_6adb13056bfc8191acb610fe75507a3e$/);
 assert.deepEqual(dryad.variation.map(v=>v.weapon.damageTypes[0]),['slash','pierce','blunt','fire','cold','lightning','corrosion']);
 for(const v of dryad.variation){
  const source=manifest.originals.find(e=>e.damageType===v.weapon.damageTypes[0]);
  assert.deepEqual([source.width,source.height,source.mode],[1254,1254,'RGBA']);assert.deepEqual(source.alphaExtrema,[0,255]);
  for(const [path,size] of [[v.img_path,512],[v.icon_path,128]]){
   const data=readFileSync(new URL('../'+path,import.meta.url));const info=losslessWebpInfo(data);
   assert.deepEqual([info.width,info.height,info.alpha],[size,size,true]);
   assert.equal(createHash('sha256').update(data).digest('hex'),source.runtime.find(r=>r.path===path).sha256);
   assert.equal(monsterAssetURL(path),path.slice(6));
  }
 }
});
test('Dryads use the approved CON/RES stats, forest levels, equipment and skill mapping',()=>{
 assert.deepEqual(dryad.A,{STR:2,CON:6,DEX:2,PER:2,INT:2,RES:6});assert.deepEqual(dryad.regions,['old_forest']);assert.equal(dryad.codexOrder,70);
 assert.deepEqual(dryad.variation.map(v=>v.codexOrder),[10,20,30,40,50,60,70]);
 for(const v of dryad.variation)for(const offset of [0,5]){
  const e=spawn(v.id,offset);assert.equal(e.level,10+offset);assert.equal(e.CON,6);assert.equal(e.RES,6);
  assert.equal(e.maxHp,offset?247:182);assert.equal(e.weapon.damageMin,8);assert.equal(e.weapon.damageMax,16);assert.equal(e.PEN,5);assert.equal(e.AR,4);assert.equal(e.hitDefense,'DEF');
  assert.deepEqual(e.skills,['dread-whisper']);
 }

});
