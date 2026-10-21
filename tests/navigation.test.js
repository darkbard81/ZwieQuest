import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../src/game.js';
import { prepareAdminGame, resetGameProgress } from '../src/account-progress.js';
import { routeTo, nodeLabels } from '../public/map-navigation.js';
import { mapSVG } from '../public/map-view.js';
import { rollEncounter } from '../src/encounters.js';
const config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url)));
const quiet = n => n === 10000 ? 9999 : Math.min(11, n - 1);
function make() { const g = new Game(config, null, quiet); g.create({name: '모험가', appearanceId: 'warrior'});g.state.homePaused=false; return g; }
function reveal(g) { prepareAdminGame(g, true); }
function targetAt(map, depth) { return Object.values(map.nodes).find(n => n.depth === depth && n.edges).id; }

test('departure selection only accepts owned checkpoints, persists, and takes effect on HOME departure without changing the current journey', () => {
 const g = make();
 assert.deepEqual(g.snapshot().availableStarts.map(m => m.id), ['village']);
 for (const mapId of ['snow', '__proto__', 'missing', null]) assert.throws(() => g.command({characterId: g.character?.id, type:'START_MAP',mapId}), /체크포인트/);
 g.advance();g.enterRegion('snow');g.choose('left');
 const before = structuredClone(g.state);
 g.command({characterId: g.character?.id, type:'START_MAP',mapId:'snow'});
 for (const key of ['mapId','currentNodeId','phase','remaining','path','hp','run']) assert.deepEqual(g.state[key],before[key]);
 let restored = new Game(config, structuredClone(g.state), quiet);
 assert.equal(restored.state.departureMapId,'snow');
 restored.finish(false);restored.advance();
 assert.equal(restored.state.mapId,'village');assert.equal(restored.state.phase,'HOME');assert.equal(restored.snapshot().mapGraph.id,'snow');
 restored = new Game(config, structuredClone(restored.state), quiet);
 assert.equal(restored.state.phase,'HOME');restored.advance();
 assert.equal(restored.state.mapId,'snow');assert.equal(restored.state.currentNodeId,restored.state.maps.snow.rootId);assert.equal(restored.state.step,0);assert.deepEqual(restored.state.path,[]);
 assert.equal(restored.state.checkpointHistory.length,1);
 assert.equal(resetGameProgress(restored,false).state.departureMapId,'village');
});

test('every unlocked map supports an automatic route from HOME, saves between steps and stops exactly at the target', () => {
 for (const mapId of ['village','volcano','snow','desert','beach']) {
  let g = make();reveal(g);g.command({characterId: g.character?.id, type:'START_MAP',mapId});
  const map=g.state.maps[mapId],target=targetAt(map,3),expected=routeTo(map,map.rootId,target);
  g.command({characterId: g.character?.id, type:'AUTO_ROUTE',mapId,nodeId:target});
  assert.equal(g.state.phase,'HOME');assert.equal(g.state.currentNodeId,g.state.maps.village.rootId);
  assert.match(mapSVG(g.snapshot()),/자동 이동 목표/);
  g = new Game(config,structuredClone(g.state),quiet);g.advance();
  for(let i=0;i<expected.length;i++) {
   assert.equal(g.state.phase,'TRAVEL');assert.equal(g.state.currentNodeId,expected[i].to);
   assert.equal(g.state.path[i].direction,expected[i].direction);
   g = new Game(config,structuredClone(g.state),quiet);g.advance();
  }
  assert.equal(g.state.currentNodeId,target);assert.equal(g.state.phase,'CHOICE_WAIT');assert.equal(g.state.autoRoute,null);
  assert.equal(g.state.path.length,expected.length);
 }
});

test('hidden targets, other maps and backward paths are rejected; visible unknown child is selectable; manual choice and cancel release the route', () => {
 const g=make(),map=g.state.maps.village,root=map.nodes[map.rootId],hidden=targetAt(map,3);
 assert.throws(()=>g.command({characterId: g.character?.id, type:'AUTO_ROUTE',mapId:'village',nodeId:hidden}),/표시된/);
 assert.throws(()=>g.command({characterId: g.character?.id, type:'AUTO_ROUTE',mapId:'snow',nodeId:g.state.maps.snow.rootId}),/표시된/);
 g.command({characterId: g.character?.id, type:'AUTO_ROUTE',mapId:'village',nodeId:root.edges.left});assert.ok(g.state.autoRoute);
 g.command({characterId: g.character?.id, type:'CANCEL_ROUTE'});assert.equal(g.state.autoRoute,null);
 reveal(g);g.command({characterId: g.character?.id, type:'AUTO_ROUTE',mapId:'village',nodeId:hidden});
 g.command({characterId: g.character?.id, type:'START_MAP',mapId:'snow'});assert.equal(g.state.autoRoute,null);
 g.command({characterId: g.character?.id, type:'START_MAP',mapId:'village'});g.advance();g.choose('left');g.advance();
 assert.throws(()=>g.command({characterId: g.character?.id, type:'AUTO_ROUTE',mapId:'village',nodeId:map.rootId}),/앞으로/);
 assert.throws(()=>g.command({characterId: g.character?.id, type:'AUTO_ROUTE',mapId:'village',nodeId:root.edges.right}),/앞으로/);
 const child=g.state.maps.village.nodes[g.state.currentNodeId].edges.left;
 g.state.autoRoute={mapId:'village',nodeId:child};
 g.command({characterId: g.character?.id, type:'CHOOSE',direction:'right',choiceId:g.state.choiceId});assert.equal(g.state.autoRoute,null);
});

test('automatic route waits for encounters, resumes after combat/treasure, and a defeat cancels it', () => {
 for (const encounter of ['battle','treasure']) {
  const g=make();reveal(g);const map=g.state.maps.village,target=targetAt(map,3);
  g.advance();g.command({characterId: g.character?.id, type:'AUTO_ROUTE',mapId:'village',nodeId:target});
  g.rng=n=>n===10000?(encounter==='battle'?0:2000):Math.min(11,n-1);g.advance();
  assert.equal(g.state.phase,encounter==='battle'?'BATTLE':'TREASURE');assert.equal(g.state.step,1);assert.ok(g.state.autoRoute);
  if(encounter==='battle'){g.character.hp=10000;g.state.enemy.hp=1;g.state.enemy.DEF=-100;g.state.enemy.AR=0;g.state.battle.actor='hero';g.battleAction('hero');assert.equal(g.state.phase,'TREASURE');}
  g.rng=quiet;g.advance();assert.equal(g.state.phase,'TRAVEL');assert.equal(g.state.step,2);
  g.advance();g.advance();assert.equal(g.state.currentNodeId,target);assert.equal(g.state.autoRoute,null);
 }
 const g=make();reveal(g);g.command({characterId: g.character?.id, type:'AUTO_ROUTE',mapId:'village',nodeId:targetAt(g.state.maps.village,3)});g.advance();g.finish(true);assert.equal(g.state.autoRoute,null);
});

test('labels use depth and stable left-to-right indexes for paths and dead ends without fixed encounter names', () => {
 const g=make();reveal(g);const map=g.state.maps.village,labels=nodeLabels(map),root=map.nodes[map.rootId];
 assert.equal(labels[root.id],'출발점');assert.equal(labels[root.edges.left],'1-1');assert.equal(labels[root.edges.right],'1-2');
 const right=map.nodes[root.edges.right];assert.equal(labels[right.edges.right],'2-4');
 const svg=mapSVG(g.snapshot());
 assert.match(svg,/>출발점<|>1-1</);assert.match(svg,/>2-4</);
 assert.doesNotMatch(svg,/>보물<|>전투<|>갈림길<|>막다른 길</);
 const before=labels[targetAt(map,3)];g.state.exploredNodes.village=[root.id];assert.equal(nodeLabels(map)[targetAt(map,3)],before);
 assert.match(mapSVG(g.snapshot()),/role="button" tabindex="0" aria-label="미탐험까지 자동 이동"/);
});

test('exclusive encounter roll covers exactly 20% battle, 5% treasure and 75% pass', () => {
 const counts={battle:0,treasure:0,pass:0};
 for(let roll=0;roll<10000;roll++) counts[rollEncounter(n=>{assert.equal(n,10000);return roll;})]++;
 assert.deepEqual(counts,{battle:2000,treasure:500,pass:7500});
});

test('every map rolls on arrival, ignores old fixed assignments, and never rerolls a saved encounter on reload', () => {
 for(const mapId of ['village','volcano','snow','desert','beach'])for(const [roll,phase] of [[0,'BATTLE'],[1999,'BATTLE'],[2000,'TREASURE'],[2499,'TREASURE'],[2500,'CHOICE_WAIT'],[9999,'CHOICE_WAIT']]) {
  const g=make();if(mapId==='village')g.advance();else g.enterRegion(mapId);
  g.choose('left');g.state.maps[mapId].nodes[g.state.currentNodeId].event='battle';
  g.rng=n=>n===10000?roll:0;g.advance();assert.equal(g.state.phase,phase);
  const old=structuredClone(g.state),restored=new Game(config,structuredClone(old),()=>{throw Error('Must not roll on reload');});
  for(const key of ['phase','remaining','hp','enemy','battle','lastReward','gold','xp'])assert.deepEqual(restored.state[key],old[key]);
  assert.ok(Object.values(restored.state.maps[mapId].nodes).every(n=>!Object.hasOwn(n,'event')));
 }
 const g=make();g.advance();g.choose('left');const arrival=structuredClone(g.state);
 for(const [roll,phase] of [[0,'BATTLE'],[2000,'TREASURE'],[2500,'CHOICE_WAIT']]) {g.state=structuredClone(arrival);g.rng=n=>n===10000?roll:0;g.advance();assert.equal(g.state.phase,phase);}
});

test('dead ends, exits and bosses keep their terminal behavior without rolling ordinary encounters', () => {
 const g=make();
 for(const map of Object.values(g.state.maps))for(const node of Object.values(map.nodes).filter(n=>!n.edges)){
  g.state.mapId=map.id;g.state.theme=map.id;g.state.currentNodeId=node.id;g.state.step=node.depth;g.state.runGold=g.state.gold;g.state.risk=0;g.phase('TRAVEL',1);
  g.rng=n=>{if(node.kind!=='boss'||n===10000)throw Error('No random encounter at a terminal');return 0;};g.advance();
  assert.equal(g.state.phase,node.kind==='boss'?'BATTLE':node.kind==='exit'?'CHOICE_WAIT':'RETURN_HOME');
 }
});
