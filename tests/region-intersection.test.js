import test from 'node:test';
import assert from 'node:assert/strict';
import { MONSTER_CATALOG, ENCOUNTER_CONFIG, eligibleVariations, eligibleBossVariations, validateMonsters } from '../src/monsters.js';
import { validateRegions } from '../src/regions.js';
const types={volcano:'fire',snow:'cold',desert:'corrosion',beach:'lightning'};
test('normal and boss pools intersect regional elements with monster region arrays',()=>{
 for(const [region,type] of Object.entries(types)){
  assert.deepEqual(ENCOUNTER_CONFIG.regions[region].allowedDamageTypes,[type]);
  for(const pool of [eligibleVariations(region),eligibleBossVariations(region)]){
   assert.equal(pool.length,4);assert.deepEqual(pool.map(p=>p.monster.id),['ghost','golem','harpy','slime']);
   assert.ok(pool.every(p=>p.variation.weapon.damageTypes.every(t=>t===type)));
  }
 }
 assert.equal(eligibleVariations('village').length,28);assert.equal(eligibleVariations('old_forest').length,49);
 for(const id of ['arachne','werewolf','dryad']){
  assert.deepEqual(MONSTER_CATALOG.find(m=>m.id===id).regions,['old_forest']);
  for(const region of Object.keys(ENCOUNTER_CONFIG.regions).filter(r=>r!=='old_forest'))assert.ok(eligibleVariations(region).every(p=>p.monster.id!==id));
 }
 const catalog=structuredClone(MONSTER_CATALOG);
 catalog.find(m=>m.id==='werewolf').regions.push('volcano');
 assert.deepEqual(eligibleVariations('volcano',catalog).filter(p=>p.monster.id==='werewolf').map(p=>p.variation.id),['fire_werewolf']);
 assert.equal(eligibleVariations('old_forest',catalog).filter(p=>p.monster.id==='werewolf').length,7);
 const restricted=structuredClone(ENCOUNTER_CONFIG);restricted.regions.old_forest.allowedDamageTypes=['cold'];
 assert.equal(eligibleVariations('old_forest',catalog,restricted).length,7);
 assert.ok(eligibleVariations('old_forest',catalog,restricted).every(p=>p.variation.weapon.damageTypes[0]==='cold'));
 assert.throws(()=>validateMonsters(catalog,restricted),/Invalid regional boss/);
});
test('mixed elements need any allowed element, while forbidden elements always exclude normal and boss candidates',()=>{
 const forbidden={volcano:'cold',snow:'fire',desert:'lightning',beach:'corrosion'};
 for(const [region,type] of Object.entries(types)){
  assert.deepEqual(ENCOUNTER_CONFIG.regions[region].excludedDamageTypes,[forbidden[region]]);
  const catalog=structuredClone(MONSTER_CATALOG),v=catalog.find(m=>m.id==='slime').variation.find(v=>v.id===`${type}_slime`);
  for(const other of ['slash','pierce','blunt']){
   v.weapon.damageTypes=[other,type];
   assert.ok(eligibleVariations(region,catalog).some(p=>p.variation.id===v.id));
   assert.ok(eligibleBossVariations(region,catalog).some(p=>p.variation.id===v.id));
  }
  v.weapon.damageTypes=[type,forbidden[region]];
  assert.ok(!eligibleVariations(region,catalog).some(p=>p.variation.id===v.id));
  assert.ok(!eligibleBossVariations(region,catalog).some(p=>p.variation.id===v.id));
  assert.ok(eligibleVariations('old_forest',catalog).some(p=>p.variation.id===v.id));
  v.weapon.damageTypes=['slash','pierce'];assert.ok(!eligibleVariations(region,catalog).some(p=>p.variation.id===v.id));
 }
 const rules=structuredClone(ENCOUNTER_CONFIG);rules.regions.volcano.allowedDamageTypes=['fire','lightning'];
 assert.ok(eligibleVariations('volcano',undefined,rules).some(p=>p.variation.id==='lightning_slime'));
});
test('empty, malformed, duplicate, unknown element restrictions fail validation',()=>{
 for(const value of [[],null,'fire',['fire','fire'],['unknown'],[null]]){
  const rules=structuredClone(ENCOUNTER_CONFIG);rules.regions.volcano.allowedDamageTypes=value;
  assert.throws(()=>validateMonsters(MONSTER_CATALOG,rules),/Invalid monster region/);
  if(value?.[0]!=='unknown')assert.throws(()=>validateRegions(rules.regions),/allowedDamageTypes/);
 }
 for(const value of [null,'cold',['cold','cold'],['unknown'],[null]]){
  const rules=structuredClone(ENCOUNTER_CONFIG);rules.regions.volcano.excludedDamageTypes=value;
  assert.throws(()=>validateMonsters(MONSTER_CATALOG,rules),/Invalid monster region/);
  if(value?.[0]!=='unknown')assert.throws(()=>validateRegions(rules.regions),/excludedDamageTypes/);
 }
 const unrestricted=structuredClone(ENCOUNTER_CONFIG);unrestricted.regions.old_forest.excludedDamageTypes=[];assert.doesNotThrow(()=>validateMonsters(MONSTER_CATALOG,unrestricted));
 const empty=structuredClone(ENCOUNTER_CONFIG);empty.regions.village.allowedDamageTypes=['raw'];assert.throws(()=>validateMonsters(MONSTER_CATALOG,empty),/No eligible monsters/);
 for(const regions of [[],null,'old_forest',['old_forest','old_forest'],['missing']]){
  const catalog=structuredClone(MONSTER_CATALOG);catalog.find(m=>m.id==='werewolf').regions=regions;assert.throws(()=>validateMonsters(catalog,ENCOUNTER_CONFIG),/Invalid monster regions/);
 }
});
