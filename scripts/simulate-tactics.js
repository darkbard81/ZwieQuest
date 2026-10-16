import {readFileSync,writeFileSync} from 'node:fs';
import {Game} from '../src/game.js';
import {generateEquipment} from '../src/equipment.js';
import {stats} from '../src/combat.js';
import {availableTactics} from '../src/tactics.js';
const config=JSON.parse(readFileSync(new URL('../config.json',import.meta.url))),rows=[],samples=100;
for(const classId of ['warrior','wizard'])for(const level of [1,10])for(const weapon of ['longsword','fire-staff'])for(const gradeId of ['normal','legendary'])for(const {id:tactic} of availableTactics(classId,config)){
 let won=0,rounds=0,capped=0,totalDamage=0,attacks=0;
 for(let seed=1;seed<=samples;seed++){
  let a=seed;const rng=n=>{a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=t+Math.imul(t^(t>>>7),61|t)^t;return Math.floor(((t^(t>>>14))>>>0)/4294967296*n);};
  const g=new Game(config,null,rng);g.create(classId);g.state.level=level;g.state.step=10;g.state.risk=1;g.state.tactic=tactic;
  const w=generateEquipment({slot:'weapon',templateId:weapon,gradeId,rng,specials:false}),armor=generateEquipment({slot:'armor',templateId:'robe',gradeId:'normal',rng,specials:false});
  g.state.inventory=[w,armor];g.state.equipment={weapon:w.id,armor:armor.id};g.state.hp=stats(g.state,config).maxHp;g.beginBattle(true);
  let n=0,lastRound=1;while(g.state.phase==='BATTLE'&&n++<3000){lastRound=g.state.battle.turn;g.events=[];g.battleAction();const h=g.events.find(e=>e.type==='hit')?.hit;if(h?.actor==='hero'){attacks++;totalDamage+=h.damage;}}
  if(g.state.phase==='TREASURE')won++;if(g.state.phase==='BATTLE')capped++;rounds+=lastRound;
 }
 rows.push({classId,level,weapon,gradeId,tactic,winPercent:won,meanRounds:+(rounds/samples).toFixed(2),meanAttackDamage:+(totalDamage/attacks).toFixed(2),capped});
}
const report={rulesVersion:2,scenario:'Depth 10 risky boss, normal robe for both classes, no charm or special option; identical monster formula; 100 seeded trials per combination',samples,totalBattles:rows.length*samples,rows};
if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');
console.table(rows.filter(r=>r.level===1&&r.gradeId==='normal'));console.log('Battles',report.totalBattles,'capped',rows.reduce((n,r)=>n+r.capped,0));
