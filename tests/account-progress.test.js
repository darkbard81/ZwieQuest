import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../src/game.js';
import { prepareAdminGame, regenerateAdminMaps, resetGameProgress } from '../src/account-progress.js';
import { MAP_GENERATION_VERSION } from '../src/maps.js';
import { stats } from '../src/combat.js';
import { generatePreviousMap } from './fixtures/maps-v2.js';
const config=JSON.parse(readFileSync(new URL('../config.json',import.meta.url)));
test('administrator gets every node and five checkpoints exactly once without an automatic character',()=>{
 const g=new Game(config);prepareAdminGame(g);
 assert.equal(g.character,null);assert.equal(g.state.characters.length,0);assert.equal(g.state.gold,0);
 assert.equal(g.state.inventory.length,0);assert.equal(g.state.phase,'HOME');
 for(const [id,map] of Object.entries(g.state.maps))assert.deepEqual(new Set(g.state.exploredNodes[id]),new Set(Object.keys(map.nodes)));
 assert.deepEqual(g.state.checkpointHistory.map(c=>c.mapId).sort(),['beach','desert','old_forest','snow','volcano']);
 const saved=structuredClone(g.state);prepareAdminGame(g);assert.deepEqual(g.state,saved);
 g.tick(30000,1);assert.equal(g.state.phase,'HOME');
});
test('existing administrator progress is preserved when maps are granted',()=>{
 const g=new Game(config);g.create({name: '모험가', appearanceId: 'wizard'});g.state.homePaused=false;g.advance();g.choose('right');g.character.level=8;g.state.gold=123;
 const before=structuredClone(g.state);prepareAdminGame(g);
 for(const key of ['level','gold','currentNodeId','path','phase','remaining','inventory','equipment','progressId'])assert.deepEqual(g.state[key],before[key]);
});
test('explicit administrator map regeneration preserves growth and possessions, clears the old journey, and keeps exploration reset after reload',()=>{
 const g=new Game(config,null,n=>n-1);prepareAdminGame(g);g.create({name:'테스트',appearanceId:'cat'});g.state.homePaused=false;
 g.state.maps=Object.fromEntries(Object.keys(g.state.maps).map(id=>[id,generatePreviousMap(id,n=>n-1)]));
 g.advance();g.enterRegion('snow');g.choose('right');g.beginBattle(true);
 g.character.level=8;g.character.xp=17;g.state.gold=321;
 g.state.bestiary={known:{encounters:2}};g.character.hp=3;
 g.state.pendingBossReturn=true;g.state.lastBossRewardId='old-route';g.state.lastReward={kind:'boss'};
 const before=structuredClone(g.state);regenerateAdminMaps(g);
 for(const key of ['characters','activeCharacterId','gold','inventory','run','completed','victories','chests','bossDefeats'])assert.deepEqual(g.state[key],before[key],key);
 assert.equal(g.character.hp,before.characters[0].hp);assert.deepEqual(g.state.bestiary,before.bestiary);assert.notEqual(g.state.progressId,before.progressId);assert.equal(g.state.homePaused,true);assert.ok(g.state.resetAt);
 assert.notDeepEqual(g.state.maps,before.maps);assert.equal(g.state.phase,'HOME');assert.equal(g.state.mapId,'village');assert.equal(g.state.currentNodeId,g.state.maps.village.rootId);assert.equal(g.state.step,0);assert.deepEqual(g.state.path,[]);
 for(const key of ['enemy','battle','choiceId','lastBossRewardId','lastReward'])assert.equal(g.state[key],null);
 assert.equal(g.state.pendingBossReturn,false);assert.equal(g.state.remaining,config.homeMs);
 assert.equal(g.state.checkpointHistory.length,0);
 for(const [id,map] of Object.entries(g.state.maps)){
  assert.equal(map.generationVersion,MAP_GENERATION_VERSION);
  assert.deepEqual(g.state.exploredNodes[id],id==='village'?[map.rootId]:[]);
 }
 const restored=new Game(config,structuredClone(g.state),()=>{throw Error('No regeneration on reload');});prepareAdminGame(restored);assert.deepEqual(restored.state,g.state);
 restored.tick(60000,1);assert.equal(restored.state.phase,'HOME');restored.command({type:'DEPART',characterId:restored.character.id});restored.choose('left');assert.equal(restored.state.phase,'TRAVEL');
});
test('complete reset clears characters and progression but keeps geography, auth-independent identity and monotonic events',()=>{
 const g=new Game(config);prepareAdminGame(g);g.create({name:'고양이',appearanceId:'cat'});g.character.level=19;g.character.xp=25;g.state.gold=900;g.command({type:'DEPART',characterId:g.character.id});g.choose('left');g.state.risk=0;g.beginBattle();
 const before=structuredClone(g.state),fresh=resetGameProgress(g,true);assert.deepEqual(g.state,before);assert.equal(fresh.character,null);assert.deepEqual(fresh.state.characters,[]);assert.deepEqual(fresh.state.maps,g.state.maps);assert.notEqual(fresh.state.progressId,g.state.progressId);
 for(const key of ['gold','run','completed','victories','chests','step'])assert.equal(fresh.state[key],0,key);assert.deepEqual(fresh.state.inventory,[]);assert.deepEqual(fresh.state.checkpointHistory,[]);assert.equal(fresh.state.phase,'HOME');assert.equal(fresh.state.enemy,null);assert.equal(fresh.state.battle,null);assert.ok(fresh.state.eventSeq>before.eventSeq);
 const reloaded=new Game(config,structuredClone(fresh.state));prepareAdminGame(reloaded);assert.deepEqual(reloaded.state.exploredNodes,fresh.state.exploredNodes);assert.deepEqual(reloaded.state.checkpointHistory,[]);reloaded.tick(60000,1.5);assert.equal(reloaded.state.run,0);
});
