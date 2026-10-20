// Deterministic balance evidence. No network, accounts or production database access.
import { readFileSync, writeFileSync } from 'node:fs';
import { Game } from '../src/game.js';
import { EQUIPMENT_CATALOG as c, generateEquipment } from '../src/equipment.js';
import { simulateBattle } from './combat-simulation.js';
import { stats } from '../src/combat.js';
const config=JSON.parse(readFileSync(new URL('../config.json',import.meta.url)));
const samples=200, rows=[];
for(const build of ['melee','staff'])for(const level of [1,10,20,40])for(const grade of c.grades){
 let wins=0, damage=0, heroAttacks=0, crits=0, timeMs=0,enemyAttacks=0, capped=0, enemy;
 for(let seed=1;seed<=samples;seed++){
  let x=seed*73856093;const rng=n=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x%n;};
  const g=new Game(config,null,rng);g.create({name: '모험가', appearanceId: 'warrior'});g.state.homePaused=false;g.character.level=level;g.state.step=10;g.state.risk=1;
  const w=generateEquipment({slot:'weapon',templateId:build==='melee'?'longsword':'fire-staff',gradeId:grade.id,specials:false,rng});
  // Armor kept constant to isolate weapon grade, no charm and no auto-upgrades.
  const a=generateEquipment({slot:'armor',templateId:build==='melee'?'leather':'robe',gradeId:'normal',specials:false,rng});
  g.state.inventory=[w,a];g.character.equipment={weapon:w.id,armor:a.id};g.character.hp=stats(g.state,config).maxHp;g.beginBattle(true);
  enemy={DEF:g.state.enemy.DEF,REF:g.state.enemy.REF,AR:g.state.enemy.AR,HP:g.state.enemy.hp};
  const result=simulateBattle(g);
  heroAttacks+=result.heroActions;enemyAttacks+=result.enemyActions;damage+=result.damage;crits+=result.criticals;timeMs+=result.battleTimeMs;
  if(result.capped)capped++;if(result.won)wins++;
 }
 rows.push({build,level,grade:grade.id,samples,enemy,winPercent:100*wins/samples,meanHeroDamage:+(damage/heroAttacks).toFixed(2),criticalPercent:+(100*crits/heroAttacks).toFixed(2),meanTimeMs:timeMs/samples,meanHeroActions:heroAttacks/samples,meanEnemyActions:enemyAttacks/samples,damagePerSecond:timeMs ? damage/(timeMs/1000) : 0,timeoutPercent:100*capped/samples,capped});
}
const report={rulesVersion:5,tactic:'normal',scenario:'Step 10 risky-route boss; constant normal starter armor; all weapon grades, no special option; 200 deterministic seeds per row. Monster formula unchanged and does not inspect equipment.',samplesPerRow:samples,totalBattles:rows.length*samples,rows};
if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');
console.table(rows.filter(r=>['normal','legendary'].includes(r.grade)).map(({build,level,grade,winPercent,meanHeroDamage,criticalPercent,meanTimeMs})=>({build,level,grade,winPercent,meanHeroDamage,criticalPercent,meanTimeMs})));
