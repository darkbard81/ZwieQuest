// Deterministic balance evidence. No network, accounts or production database access.
import { readFileSync, writeFileSync } from 'node:fs';
import { Game } from '../src/game.js';
import { EQUIPMENT_CATALOG as c, generateEquipment } from '../src/equipment.js';
import { stats } from '../src/combat.js';
const config=JSON.parse(readFileSync(new URL('../config.json',import.meta.url)));
const samples=200, rows=[];
for(const classId of ['warrior','wizard'])for(const level of [1,10,20,40])for(const grade of c.grades){
 let wins=0, damage=0, heroAttacks=0, crits=0, turns=0, capped=0, enemy;
 for(let seed=1;seed<=samples;seed++){
  let x=seed*73856093;const rng=n=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x%n;};
  const g=new Game(config,null,rng);g.create(classId);g.state.level=level;g.state.step=10;g.state.risk=1;
  const w=generateEquipment({slot:'weapon',classId,templateId:classId==='warrior'?'longsword':'fire-staff',gradeId:grade.id,specials:false,rng});
  // Armor kept constant to isolate weapon grade, no charm and no auto-upgrades.
  const a=generateEquipment({slot:'armor',classId,templateId:classId==='warrior'?'leather':'robe',gradeId:'normal',specials:false,rng});
  g.state.inventory=[w,a];g.state.equipment={weapon:w.id,armor:a.id};g.state.hp=stats(g.state,config).maxHp;g.beginBattle(true);
  enemy={DEF:g.state.enemy.DEF,REF:g.state.enemy.REF,AR:g.state.enemy.AR,HP:g.state.enemy.hp};
  let actions=0,lastTurn=1;
  while(g.state.phase==='BATTLE'&&actions++<2000){lastTurn=g.state.battle.turn;g.events=[];g.battleAction();const h=g.events.find(e=>e.type==='hit')?.hit;if(h?.actor==='hero'){heroAttacks++;damage+=h.damage;if(h.tier===3)crits++;}}
  if(g.state.phase==='BATTLE')capped++;if(g.state.phase==='TREASURE')wins++;turns+=lastTurn;
 }
 rows.push({classId,level,grade:grade.id,samples,enemy,winPercent:100*wins/samples,meanHeroDamage:+(damage/heroAttacks).toFixed(2),criticalPercent:+(100*crits/heroAttacks).toFixed(2),meanTurns:+(turns/samples).toFixed(2),capped});
}
const report={rulesVersion:2,tactic:'normal',scenario:'Step 10 risky-route boss; constant normal starter armor; all weapon grades, no special option; 200 deterministic seeds per row. Monster formula unchanged and does not inspect equipment.',samplesPerRow:samples,totalBattles:rows.length*samples,rows};
if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');
console.table(rows.filter(r=>['normal','legendary'].includes(r.grade)).map(({classId,level,grade,winPercent,meanHeroDamage,criticalPercent,meanTurns})=>({classId,level,grade,winPercent,meanHeroDamage,criticalPercent,meanTurns})));
