import {readFileSync,writeFileSync} from 'node:fs';
import {Game} from '../src/game.js';
import {generateEquipment} from '../src/equipment.js';
import {simulateBattle} from './combat-simulation.js';
import {stats} from '../src/combat.js';
const config=JSON.parse(readFileSync(new URL('../config.json',import.meta.url))),rows=[],samples=100;
for(const level of [1,10])for(const weapon of ['longsword','fire-staff'])for(const gradeId of ['normal','legendary']){
 let won=0,timeMs=0,enemyActions=0,capped=0,totalDamage=0,attacks=0;
 for(let seed=1;seed<=samples;seed++){
  let a=seed;const rng=n=>{a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=t+Math.imul(t^(t>>>7),61|t)^t;return Math.floor(((t^(t>>>14))>>>0)/4294967296*n);};
  const g=new Game(config,null,rng);g.create({name: '모험가', appearanceId: 'warrior'});g.state.homePaused=false;g.character.level=level;g.state.step=10;g.state.risk=1;
  const w=generateEquipment({slot:'weapon',templateId:weapon,gradeId,rng,specials:false}),armor=generateEquipment({slot:'armor',templateId:'robe',gradeId:'normal',rng,specials:false});
  g.state.inventory=[w,armor];g.character.equipment={weapon:w.id,armor:armor.id};g.character.hp=stats(g.state,config).maxHp;g.beginBattle(true);
  const result=simulateBattle(g);attacks+=result.heroActions;enemyActions+=result.enemyActions;totalDamage+=result.damage;timeMs+=result.battleTimeMs;
  if(result.won)won++;if(result.capped)capped++;
 }
 rows.push({level,weapon,gradeId,winPercent:won,meanTimeMs:timeMs/samples,meanHeroActions:attacks/samples,meanEnemyActions:enemyActions/samples,damagePerSecond:timeMs ? totalDamage/(timeMs/1000) : 0,timeoutPercent:100*capped/samples,meanAttackDamage:+(totalDamage/attacks).toFixed(2),capped});
}
const report={rulesVersion:5,scenario:'Basic attacks only (no auto skills). Depth 10 risky boss, normal robe for all builds, no charm or special option; identical monster formula; 100 seeded trials per combination',samples,totalBattles:rows.length*samples,rows};
if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');
console.table(rows.filter(r=>r.level===1&&r.gradeId==='normal'));console.log('Battles',report.totalBattles,'capped',rows.reduce((n,r)=>n+r.capped,0));
