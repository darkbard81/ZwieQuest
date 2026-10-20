// Deterministic balance evidence. No network, accounts or production database access.
import { readFileSync, writeFileSync } from 'node:fs';
import { Game } from '../src/game.js';
import { EQUIPMENT_CATALOG as c, generateEquipment } from '../src/equipment.js';
import { simulateBattle } from './combat-simulation.js';
import { stats } from '../src/combat.js';
import { ENCOUNTER_CONFIG } from '../src/monsters.js';
import { COMBAT_RULES_VERSION } from '../src/action-speed.js';
// Usage: node scripts/simulate-equipment.js [report.json] [region=village]
const mapId = process.argv[3] || 'village';
if (!Object.hasOwn(ENCOUNTER_CONFIG.regions, mapId)) throw Error(`Unknown encounter region: ${mapId}`);
const config=JSON.parse(readFileSync(new URL('../config.json',import.meta.url)));
const samples=200, rows=[];
for(const build of ['melee','staff'])for(const level of [1,10,20,40])for(const grade of c.grades){
 let wins=0, damage=0, heroAttacks=0, crits=0, timeMs=0,enemyAttacks=0, capped=0;const encounters={};
 for(let seed=1;seed<=samples;seed++){
  let rngState=seed;const rng=n=>{rngState=(rngState+0x6D2B79F5)|0;let t=Math.imul(rngState^(rngState>>>15),1|rngState);t=t+Math.imul(t^(t>>>7),61|t)^t;return Math.floor(((t^(t>>>14))>>>0)/4294967296*n);};
  const g=new Game(config,null,rng);g.create({name: '모험가', appearanceId: 'warrior'});g.state.homePaused=false;g.character.level=level;g.state.mapId=mapId;g.state.theme=mapId;g.state.currentNodeId=g.state.maps[mapId].rootId;
  const w=generateEquipment({slot:'weapon',templateId:build==='melee'?'longsword':'fire-staff',gradeId:grade.id,specials:false,rng});
  // Armor kept constant to isolate weapon grade, no charm and no auto-upgrades.
  const a=generateEquipment({slot:'armor',templateId:build==='melee'?'leather':'robe',gradeId:'normal',specials:false,rng});
  g.state.inventory=[w,a];g.character.equipment={weapon:w.id,armor:a.id};g.character.hp=stats(g.state,config).maxHp;g.beginBattle(false);
  encounters[g.state.enemy.variationId]=(encounters[g.state.enemy.variationId]||0)+1;
  const result=simulateBattle(g);
  heroAttacks+=result.heroActions;enemyAttacks+=result.enemyActions;damage+=result.damage;crits+=result.criticals;timeMs+=result.battleTimeMs;
  if(result.capped)capped++;if(result.won)wins++;
 }
 rows.push({build,level,grade:grade.id,samples,encounters,winPercent:100*wins/samples,meanHeroDamage:+(damage/heroAttacks).toFixed(2),criticalPercent:+(100*crits/heroAttacks).toFixed(2),meanTimeMs:timeMs/samples,meanHeroActions:heroAttacks/samples,meanEnemyActions:enemyAttacks/samples,damagePerSecond:timeMs ? damage/(timeMs/1000) : 0,timeoutPercent:100*capped/samples,capped});
}
const report={rulesVersion:COMBAT_RULES_VERSION,mapId,encounterRules:ENCOUNTER_CONFIG.regions[mapId],tactic:'normal',scenario:'Random non-boss encounters in the selected region using live monster generation (variation, level, grade and attributes). Basic attacks only; constant normal starter armor; all weapon grades, no charm or special option; 200 deterministic seeds per row. Encounter trigger probability and travel time are excluded.',samplesPerRow:samples,totalBattles:rows.length*samples,rows};
if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');
console.log('Encounter region:',mapId);
console.table(rows.filter(r=>['normal','legendary'].includes(r.grade)).map(({build,level,grade,winPercent,meanHeroDamage,criticalPercent,meanTimeMs})=>({build,level,grade,winPercent,meanHeroDamage,criticalPercent,meanTimeMs})));
