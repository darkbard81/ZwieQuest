import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MONSTER_CATALOG, ENCOUNTER_CONFIG, eligibleVariations, validateMonsters, generateMonster, monsterRewards, recordMonsterEncounter } from '../src/monsters.js';
import { stats } from '../src/combat.js';
import { actionSpeed } from '../src/action-speed.js';
import { Game } from '../src/game.js';
import { resetGameProgress } from '../src/account-progress.js';
import { EQUIPMENT_CATALOG } from '../src/equipment.js';
import { pointBudget } from '../src/characters.js';
import { monsterAssetURL } from '../public/monster-assets.js';
const config=JSON.parse(readFileSync(new URL('../config.json',import.meta.url)));
const make=()=>{const g=new Game(config,null,()=>0);g.create({name:'도감 검사',appearanceId:'warrior'});g.state.risk=0;return g;};
const rngFor=(variation=0,level=0,grade=0,attribute=0)=>{let call=0;return n=>[variation,level,grade][call++]??attribute;};

test('each region has inclusive level bounds and excludes any matching damage type',()=>{
 const bans={village:null,volcano:'cold',snow:'fire',desert:'lightning',beach:'corrosion'};
 for(const [map,ban] of Object.entries(bans)){
  const pool=eligibleVariations(map);assert.equal(pool.length,ban?18:21);
  assert.ok(pool.every(({variation:v})=>!v.weapon.damageTypes.includes(ban)));
  for(let i=0;i<pool.length;i++)for(const edge of [0,ENCOUNTER_CONFIG.regions[map].maxLevel-ENCOUNTER_CONFIG.regions[map].minLevel]){
   const e=generateMonster(map,rngFor(i,edge));assert.equal(e.variationId,pool[i].variation.id);assert.equal(e.level,edge+ENCOUNTER_CONFIG.regions[map].minLevel);
  }
 }
 const c=structuredClone(MONSTER_CATALOG);c.find(m=>m.id==='slime').variation[0].weapon.damageTypes=['slash','cold'];assert.ok(!eligibleVariations('volcano',c).some(({variation:v})=>v.id==='slash_slime'));
 assert.throws(()=>generateMonster('missing',()=>0),/Unknown/);
 const empty=structuredClone(ENCOUNTER_CONFIG);empty.regions.village.excludedDamageTypes=Object.keys(EQUIPMENT_CATALOG.damageTypes);
 assert.throws(()=>validateMonsters(MONSTER_CATALOG,empty),/No eligible/);assert.throws(()=>generateMonster('village',()=>0,MONSTER_CATALOG,empty),/No eligible/);
});
test('grades share equipment bonuses and exact weights, normal omits name prefix, no affixes',()=>{
 const counts={normal:0,fine:0,excellent:0,superior:0,legendary:0};
 for(let grade=0;grade<100;grade++){
  const e=generateMonster('village',rngFor(eligibleVariations('village').findIndex(({variation})=>variation.id==='slash_slime'),0,grade));counts[e.gradeId]++;
  const g=EQUIPMENT_CATALOG.grades.find(g=>g.id===e.gradeId);
  assert.equal(e.weapon.gradeId,e.armor.gradeId);assert.equal(e.weapon.stats.ACC,-1+g.ACC);assert.equal(e.PEN,5+g.PEN);assert.equal(e.AR,3+g.AR);assert.equal(e.weapon.damageRate,g.damageRate);
  assert.equal(e.name,g.id==='normal'?'슬라임(베기)':`${g.name} 슬라임(베기)`);assert.equal(e.weapon.special,null);assert.equal(e.armor.special,null);
 }
 assert.deepEqual(Object.values(counts),[60,25,10,4,1]);
});
test('point allocation and derived HP, ACC, defenses, LB use template and level',()=>{
 for(const map of ['village','volcano'])for(let level=0;level<=ENCOUNTER_CONFIG.regions[map].maxLevel-ENCOUNTER_CONFIG.regions[map].minLevel;level++)for(let attr=0;attr<6;attr++){
  const e=generateMonster(map,rngFor(0,level,0,attr)),lb=Math.floor((e.level-1)/3);
  assert.equal(Object.values(e.allocatedAttributes).reduce((a,b)=>a+b,0),pointBudget(e.level));
  assert.equal(e.hp,10+2*(e.level-1)+5*e.CON);assert.equal(e.maxHp,e.hp);assert.equal(e.ACC,9+e.PER+lb);
  assert.equal(e.DEF,10+e.RES+lb);assert.equal(e.REF,10+e.DEX+e.PER+lb);assert.equal(e.FOR,10+e.STR+e.CON+lb);assert.equal(e.WIL,10+e.INT+e.RES+lb);
 }
 const a=make(),b=make();b.character.level=99;b.character.attributes.STR=200;b.state.risk=20;b.state.step=10;a.beginBattle();b.beginBattle();
 for(const key of ['level','attributes','ACC','DEF','maxHp','gradeId','variationId'])assert.deepEqual(a.state.enemy[key],b.state.enemy[key]);
});
test('variation armor weaknesses differ and reference validated full and icon assets',()=>{
 for(const {variation} of MONSTER_CATALOG)for(const v of variation){
  assert.equal(Object.keys(v.armor.typeModifiers).length,2);assert.ok(!Object.hasOwn(v.armor.typeModifiers,v.weapon.damageTypes[0]));assert.ok(Object.values(v.armor.typeModifiers).every(n=>n===-2));
  for(const path of [v.img_path,v.icon_path]){const data=readFileSync(new URL('../'+path,import.meta.url));assert.equal(data.toString('ascii',0,4),'RIFF');assert.equal(data.toString('ascii',8,12),'WEBP');assert.ok(monsterAssetURL(path).startsWith('/assets/monster/'));}
 }
 for(const unsafe of ['https://test/x.webp','public/assets/monster/../../secret.webp',null])assert.equal(monsterAssetURL(unsafe),'');
 const duplicate=structuredClone(MONSTER_CATALOG);duplicate[0].variation.push(duplicate[0].variation[0]);assert.throws(()=>validateMonsters(duplicate,ENCOUNTER_CONFIG),/duplicate/);
});
test('XP is zero below character, 10 equal kills to level, higher bonus capped at twice',()=>{
 for(const C of [1,5,10,20,21])for(let d=-1;d<=8;d++){
  const r=monsterRewards({level:C+d,gradeId:'normal'},C,40);assert.equal(r.xp,d<0?0:Math.floor(4*C*(1+.25*Math.min(d,4))));assert.equal(r.canDrop,d>=0);
 }
 for(const grade of EQUIPMENT_CATALOG.grades){const r=monsterRewards({level:10,gradeId:grade.id},10,40);assert.equal(r.xp,40);assert.equal(r.gold,Math.floor(24*ENCOUNTER_CONFIG.rewards.goldMultipliers[grade.id]));}
 for(const C of [1,5,10,20]){
  const g=make();g.character.level=C;g.rng=()=>0;
  for(let i=1;i<=10;i++){g.beginBattle();g.state.enemy.level=C;g.reward('victory');assert.equal(g.state.lastReward.xp,4*C);assert.equal(g.character.level,i===10?C+1:C);assert.ok(g.state.lastReward.itemId);}
  assert.equal(g.character.xp,0);
 }
});
test('lower monster gives gold only; no loot random draw; eligibility uses level before award',()=>{
 const g=make();g.character.level=2;g.beginBattle();const count=g.state.inventory.length;g.rng=()=>{throw Error('lower-level loot must not roll');};g.reward('victory');
 assert.equal(g.character.xp,0);assert.equal(g.state.gold,6);assert.equal(g.state.inventory.length,count);assert.equal(g.state.lastReward.goldOnly,true);
 g.rng=()=>0;g.character.level=1;g.character.xp=36;g.beginBattle();g.reward('victory');assert.equal(g.character.level,2);assert.equal(g.character.xp,0);assert.ok(g.state.lastReward.itemId);assert.equal(g.state.lastReward.goldOnly,false);
});
test('bestiary groups by encountered variation, records grade/level/history and persists without reroll',()=>{
 const [firstId,secondId]=eligibleVariations('village').slice(0,2).map(({variation})=>variation.id);
 const g=make();assert.deepEqual(g.state.bestiary,{});g.beginBattle();const first=structuredClone(g.state.enemy);recordMonsterEncounter(g.state,g.state.enemy);assert.equal(g.state.bestiary[firstId].encounters,1);
 g.rng=rngFor(0,4,60,1);g.beginBattle();assert.equal(Object.keys(g.state.bestiary).length,1);assert.equal(g.state.bestiary[firstId].encounters,2);assert.deepEqual(g.state.bestiary[firstId].grades,{normal:1,fine:1});assert.equal(g.state.bestiary[firstId].minLevel,1);assert.equal(g.state.bestiary[firstId].maxLevel,5);
 g.rng=rngFor(1);g.beginBattle();assert.deepEqual(Object.keys(g.state.bestiary),[firstId,secondId]);
 const saved=JSON.parse(JSON.stringify(g.state)),restored=new Game(config,structuredClone(saved),()=>{throw Error('reload must not reroll');});assert.deepEqual(restored.state.enemy,{...saved.enemy,...actionSpeed(saved.enemy.DEX)});assert.deepEqual(restored.state.bestiary,saved.bestiary);
 restored.rng=()=>9999;restored.reward('victory');assert.equal(restored.state.bestiary[secondId].defeats,1);assert.equal(restored.state.bestiary[firstId].defeats,0);
 assert.equal(first.maxHp,10);assert.deepEqual(make().state.bestiary,{});assert.deepEqual(resetGameProgress(restored,false).state.bestiary,{});
});
test('bosses and old in-flight monsters retain legacy combat/rewards and do not enter variation grid',()=>{
 const g=make();g.beginBattle(true);assert.equal(g.state.enemy.generationVersion,undefined);assert.deepEqual(g.state.bestiary,{});g.reward('boss');assert.equal(g.state.lastReward.xp,config.balance.bossXP);
 g.state.enemy={name:'old',hp:7,maxHp:12,DEX:1,base:9};const h=new Game(config,structuredClone(g.state));assert.deepEqual(h.state.enemy,{...g.state.enemy,...actionSpeed(g.state.enemy.DEX)});assert.deepEqual(h.state.bestiary,{});
});

test('all seven harpy attacks use Reflex in generated combat and retain their names',()=>{
 const pool=eligibleVariations('village'),harpies=pool.filter(({monster})=>monster.id==='harpy');
 assert.equal(harpies.length,7);
 assert.equal(new Set(harpies.flatMap(({variation})=>variation.weapon.damageTypes)).size,7);
 for(const {variation:v} of harpies){
  const g=make();g.character.attributes.DEX=7;g.character.attributes.RES=1;
  g.rng=rngFor(pool.findIndex(({variation})=>variation.id===v.id));g.beginBattle();
  assert.equal(g.state.enemy.monsterId,'harpy');assert.equal(g.state.enemy.hitDefense,'REF');assert.equal(g.state.enemy.weapon.hitDefense,'REF');
  assert.match(g.state.enemy.name,/하피/);assert.equal(g.state.enemy.attackName,v.weapon.name);
  const hero=stats(g.state,config);assert.notEqual(hero.REF,hero.DEF);
  g.rng=()=>0;g.battleAction('enemy');
  assert.equal(g.state.battle.lastHit.target,'REF');assert.equal(g.state.battle.lastHit.calculation.defense,hero.REF);assert.equal(g.state.battle.lastHit.ability,v.weapon.name);
 }
});

test('all seven golem attacks use Fortitude in generated combat and retain their names',()=>{
 const pool=eligibleVariations('village'),golems=pool.filter(({monster})=>monster.id==='golem');
 assert.equal(golems.length,7);
 assert.equal(new Set(golems.flatMap(({variation})=>variation.weapon.damageTypes)).size,7);
 for(const {variation:v} of golems){
  const g=make();g.character.attributes.STR=7;g.character.attributes.RES=1;
  g.rng=rngFor(pool.findIndex(({variation})=>variation.id===v.id));g.beginBattle();
  assert.equal(g.state.enemy.monsterId,'golem');assert.equal(g.state.enemy.hitDefense,'FOR');assert.equal(g.state.enemy.weapon.hitDefense,'FOR');
  assert.match(g.state.enemy.name,/골렘/);assert.equal(g.state.enemy.attackName,v.weapon.name);
  const hero=stats(g.state,config);assert.notEqual(hero.FOR,hero.DEF);
  g.rng=()=>0;g.battleAction('enemy');
  assert.equal(g.state.battle.lastHit.target,'FOR');assert.equal(g.state.battle.lastHit.calculation.defense,hero.FOR);assert.equal(g.state.battle.lastHit.ability,v.weapon.name);
 }
});
