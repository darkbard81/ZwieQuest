import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { ProbabilitySettings, DEFAULT_PROBABILITIES, validateProbabilities } from '../src/probabilities.js';
import { rollEncounter } from '../src/encounters.js';
import { Game } from '../src/game.js';
const config=JSON.parse(readFileSync(new URL('../config.json',import.meta.url)));
const settings=(battlePercent,treasurePercent,dropPercent=25)=>({battlePercent,treasurePercent,passPercent:100-battlePercent-treasurePercent,dropPercent});
test('exclusive encounter thresholds cover all rolls including zero and full segments',()=>{
 for(const p of [DEFAULT_PROBABILITIES,settings(0,0),settings(100,0),settings(0,100),settings(30,40),settings(1,99)]){
  const counts={battle:0,treasure:0,pass:0};for(let n=0;n<10000;n++)counts[rollEncounter(()=>n,p)]++;
  assert.deepEqual(counts,{battle:p.battlePercent*100,treasure:p.treasurePercent*100,pass:p.passPercent*100});
 }
});
test('shared runtime settings govern existing games and all-level loot without changing chest rewards',()=>{
 const shared={...config,probabilities:settings(0,0,0)};
 const games=[0,1].map(()=>{const g=new Game(shared,null,()=>0);g.create({name:'확률 검증',appearanceId:'warrior'});g.character.level=20;return g;});
 for(const p of [settings(100,0,100),settings(0,100,0),settings(0,0,25)]){
  shared.probabilities=p;
  for(const g of games){
   g.state.mapId='village';g.state.currentNodeId=Object.values(g.state.maps.village.nodes).find(n=>n.kind==='path'&&n.depth===1).id;g.state.phase='TRAVEL';g.advance();
   assert.equal(g.state.phase,p.battlePercent?'BATTLE':p.treasurePercent?'TREASURE':'CHOICE_WAIT');
  }
 }
 for(const dropPercent of [0,100]){
  shared.probabilities=settings(20,5,dropPercent);
  for(const g of games){g.beginBattle();g.reward('victory');assert.equal(Boolean(g.state.lastReward.itemId),dropPercent===100);assert.equal(g.state.lastReward.xp,1);g.reward('treasure');assert.equal(g.state.lastReward.itemId,null);}
 }
});
test('settings validate, persist atomically, reject stale writes and deduplicate retries',()=>{
 const db=new DatabaseSync(':memory:');try{
  const store=new ProbabilitySettings(db);assert.deepEqual(store.read().probabilities,DEFAULT_PROBABILITIES);
  for(const value of [null,[],{},settings(101,0),{...settings(20,5),dropPercent:NaN},{...settings(20,5),battlePercent:20.5},{...settings(20,5),passPercent:74},{...settings(20,5),extra:1}])assert.throws(()=>validateProbabilities(value));
  const a={revision:0,requestId:randomUUID(),probabilities:settings(30,10,40)};
  const result=store.update('admin',a);assert.equal(result.revision,1);assert.deepEqual(new ProbabilitySettings(db).read(),result);
  assert.equal(store.update('admin',a).duplicate,true);assert.equal(store.read().revision,1);
  assert.throws(()=>store.update('other',{...a,requestId:randomUUID()}),e=>e.status===409);
  assert.throws(()=>store.update('admin',{...a,probabilities:settings(0,100)}),e=>e.status===409);
  const b={revision:1,requestId:randomUUID(),probabilities:settings(0,0,0)};
  db.exec("CREATE TRIGGER reject_probability BEFORE UPDATE ON probability_settings BEGIN SELECT RAISE(ABORT,'rollback fixture'); END;");
  assert.throws(()=>store.update('admin',b),/rollback/);assert.equal(store.read().revision,1);assert.equal(db.prepare('SELECT COUNT(*) n FROM probability_requests').get().n,1);
  db.exec('DROP TRIGGER reject_probability');store.update('admin',b);
  assert.equal(store.update('admin',a).revision,2);assert.deepEqual(store.read().probabilities,b.probabilities);
 }finally{db.close();}
});
