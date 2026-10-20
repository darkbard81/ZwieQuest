import {readFileSync,writeFileSync} from 'node:fs';
import {Game} from '../src/game.js';
import {generateEquipment} from '../src/equipment.js';
import {simulateBattle} from './combat-simulation.js';
import {stats} from '../src/combat.js';
import { ENCOUNTER_CONFIG } from '../src/monsters.js';
import { COMBAT_RULES_VERSION } from '../src/action-speed.js';
// Usage: node scripts/simulate-tactics.js [report.json] [region=village]
const mapId = process.argv[3] || 'village';
if (!Object.hasOwn(ENCOUNTER_CONFIG.regions, mapId)) throw Error(`Unknown encounter region: ${mapId}`);
const config=JSON.parse(readFileSync(new URL('../config.json',import.meta.url))),rows=[],samples=100;
for(const level of [1,10])for(const weapon of ['longsword','fire-staff'])for(const gradeId of ['normal','legendary']){
 let won=0,timeMs=0,enemyActions=0,capped=0,totalDamage=0,attacks=0;const encounters={};
 for(let seed=1;seed<=samples;seed++){
  let a=seed;const rng=n=>{a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=t+Math.imul(t^(t>>>7),61|t)^t;return Math.floor(((t^(t>>>14))>>>0)/4294967296*n);};
  const g=new Game(config,null,rng);g.create({name: '모험가', appearanceId: 'warrior'});g.state.homePaused=false;g.character.level=level;g.state.mapId=mapId;g.state.theme=mapId;g.state.currentNodeId=g.state.maps[mapId].rootId;
  const w=generateEquipment({slot:'weapon',templateId:weapon,gradeId,rng,specials:false}),armor=generateEquipment({slot:'armor',templateId:'robe',gradeId:'normal',rng,specials:false});
  g.state.inventory=[w,armor];g.character.equipment={weapon:w.id,armor:armor.id};g.character.hp=stats(g.state,config).maxHp;g.beginBattle(false);
  encounters[g.state.enemy.variationId]=(encounters[g.state.enemy.variationId]||0)+1;
  const result=simulateBattle(g);attacks+=result.heroActions;enemyActions+=result.enemyActions;totalDamage+=result.damage;timeMs+=result.battleTimeMs;
  if(result.won)won++;if(result.capped)capped++;
 }
 rows.push({level,weapon,gradeId,encounters,winPercent:100*won/samples,meanTimeMs:timeMs/samples,meanHeroActions:attacks/samples,meanEnemyActions:enemyActions/samples,damagePerSecond:timeMs ? totalDamage/(timeMs/1000) : 0,timeoutPercent:100*capped/samples,meanAttackDamage:+(totalDamage/attacks).toFixed(2),capped});
}
const report={rulesVersion:COMBAT_RULES_VERSION,mapId,encounterRules:ENCOUNTER_CONFIG.regions[mapId],scenario:'Random non-boss encounters in the selected region using live monster generation (variation, level, grade and attributes). Basic attacks only (no auto skills); normal robe for all builds, no charm or special option; 100 seeded trials per combination. Encounter trigger probability and travel time are excluded.',samples,totalBattles:rows.length*samples,rows};
if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');
console.log('Encounter region:',mapId);
console.table(rows.filter(r=>r.level===1&&r.gradeId==='normal').map(({encounters,...row})=>row));console.log('Battles',report.totalBattles,'capped',rows.reduce((n,r)=>n+r.capped,0));
