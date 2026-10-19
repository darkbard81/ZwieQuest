import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../src/game.js';
import { prepareAdminGame, regenerateAdminMaps, resetGameProgress } from '../src/account-progress.js';
import { MAP_GENERATION_VERSION } from '../src/maps.js';
import { stats } from '../src/combat.js';
import { generatePreviousMap } from './fixtures/maps-v2.js';
const config=JSON.parse(readFileSync(new URL('../config.json',import.meta.url)));
test('administrator gets a playable hero, every node and four checkpoints exactly once',()=>{
 const g=new Game(config);prepareAdminGame(g);
 assert.equal(g.state.classId,'warrior');assert.equal(g.state.level,1);assert.equal(g.state.gold,0);
 assert.equal(g.state.inventory.length,3);assert.equal(g.state.phase,'HOME');
 for(const [id,map] of Object.entries(g.state.maps))assert.deepEqual(new Set(g.state.exploredNodes[id]),new Set(Object.keys(map.nodes)));
 assert.deepEqual(g.state.checkpointHistory.map(c=>c.mapId).sort(),['beach','desert','snow','volcano']);
 const saved=structuredClone(g.state);prepareAdminGame(g);assert.deepEqual(g.state,saved);
 g.advance();g.choose('left');assert.equal(g.state.phase,'TRAVEL');
});
test('existing administrator progress is preserved when maps are granted',()=>{
 const g=new Game(config);g.create('wizard');g.advance();g.choose('right');g.state.level=8;g.state.gold=123;
 const before=structuredClone(g.state);prepareAdminGame(g);
 for(const key of ['level','gold','currentNodeId','path','phase','remaining','inventory','equipment','progressId'])assert.deepEqual(g.state[key],before[key]);
});
test('explicit administrator map regeneration preserves growth and possessions, clears the old journey, and persists new exploration',()=>{
 const g=new Game(config,null,n=>n-1);prepareAdminGame(g);
 g.state.maps=Object.fromEntries(Object.keys(g.state.maps).map(id=>[id,generatePreviousMap(id,n=>n-1)]));
 g.advance();g.enterRegion('snow');g.choose('right');g.beginBattle(true);
 g.state.level=8;g.state.xp=17;g.state.gold=321;g.state.inactiveClasses.wizard={level:4,xp:12,equipment:{}};
 g.state.pendingBossReturn=true;g.state.lastBossRewardId='old-route';g.state.lastReward={kind:'boss'};
 const before=structuredClone(g.state);regenerateAdminMaps(g);
 for(const key of ['level','xp','gold','classId','appearanceId','inventory','equipment','inactiveClasses','progressId','run','completed','victories','chests','bossDefeats'])assert.deepEqual(g.state[key],before[key],key);
 assert.equal(g.state.hp,before.hp);
 assert.notDeepEqual(g.state.maps,before.maps);assert.equal(g.state.phase,'HOME');assert.equal(g.state.mapId,'village');assert.equal(g.state.currentNodeId,g.state.maps.village.rootId);assert.equal(g.state.step,0);assert.deepEqual(g.state.path,[]);
 for(const key of ['enemy','battle','choiceId','lastBossRewardId','lastReward'])assert.equal(g.state[key],null);
 assert.equal(g.state.pendingBossReturn,false);assert.equal(g.state.remaining,config.homeMs);
 assert.equal(g.state.checkpointHistory.length,4);
 for(const [id,map] of Object.entries(g.state.maps)){
  assert.equal(map.generationVersion,MAP_GENERATION_VERSION);
  assert.deepEqual(new Set(g.state.exploredNodes[id]),new Set(Object.keys(map.nodes)));
  if(id!=='village')assert.equal(g.state.checkpointHistory.find(c=>c.mapId===id).nodeId,map.rootId);
 }
 const restored=new Game(config,structuredClone(g.state),()=>{throw Error('No regeneration on reload');});prepareAdminGame(restored);assert.deepEqual(restored.state,g.state);
 restored.advance();restored.choose('left');assert.equal(restored.state.phase,'TRAVEL');
});
test('complete reset keeps identity and geography, clears all progression, and does not regrant admin maps on reload',()=>{
 const g=new Game(config);prepareAdminGame(g);g.command({type:'APPEARANCE',appearanceId:'cat'});
 g.state.level=19;g.state.xp=25;g.state.gold=900;g.state.inactiveClasses.wizard={level:12,xp:22,equipment:{}};
 g.advance();g.choose('left');g.beginBattle();
 const before=structuredClone(g.state),fresh=resetGameProgress(g,true);
 assert.deepEqual(g.state,before);assert.equal(fresh.state.appearanceId,'cat');assert.equal(fresh.state.classId,'warrior');
 assert.deepEqual(fresh.state.maps,g.state.maps);assert.notEqual(fresh.state.progressId,g.state.progressId);
 for(const key of ['gold','xp','run','completed','victories','chests','step'])assert.equal(fresh.state[key],0,key);
 assert.equal(fresh.state.level,1);assert.deepEqual(fresh.state.inactiveClasses,{});assert.deepEqual(fresh.state.path,[]);assert.deepEqual(fresh.state.checkpointHistory,[]);
 assert.equal(fresh.state.inventory.length,3);assert.ok(fresh.state.inventory.filter(i=>i.slot!=='skill').every(i=>i.gradeId==='normal'&&!i.special));assert.deepEqual(Object.keys(fresh.state.equipment).sort(),['armor','weapon']);
 assert.deepEqual(fresh.state.exploredNodes.village,[fresh.state.maps.village.rootId]);for(const id of ['snow','beach','desert','volcano'])assert.deepEqual(fresh.state.exploredNodes[id],[]);
 assert.equal(fresh.state.phase,'HOME');assert.equal(fresh.state.enemy,null);assert.equal(fresh.state.battle,null);assert.equal(fresh.events.length,1);assert.ok(fresh.state.eventSeq>before.eventSeq);
 const reloaded=new Game(config,structuredClone(fresh.state));prepareAdminGame(reloaded);assert.deepEqual(reloaded.state.exploredNodes,fresh.state.exploredNodes);assert.deepEqual(reloaded.state.checkpointHistory,[]);
 assert.equal(reloaded.snapshot().classProfiles.wizard.level,1);
});
