import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../src/game.js';
import { prepareAdminGame, resetGameProgress, regenerateAdminMaps } from '../src/account-progress.js';
import { routeTo, nodeLabels } from '../public/map-navigation.js';
import { mapSVG } from '../public/map-view.js';
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

test('hidden targets and other maps are rejected; visible backward paths reserve and manual choice cancels only immediate routing', () => {
 const g=make(),map=g.state.maps.village,root=map.nodes[map.rootId],hidden=targetAt(map,3);
 assert.throws(()=>g.command({characterId: g.character?.id, type:'AUTO_ROUTE',mapId:'village',nodeId:hidden}),/표시된/);
 assert.throws(()=>g.command({characterId: g.character?.id, type:'AUTO_ROUTE',mapId:'snow',nodeId:g.state.maps.snow.rootId}),/표시된/);
 g.command({characterId: g.character?.id, type:'AUTO_ROUTE',mapId:'village',nodeId:root.edges.left});assert.ok(g.state.autoRoute);
 g.command({characterId: g.character?.id, type:'CANCEL_ROUTE'});assert.equal(g.state.autoRoute,null);
 reveal(g);g.command({characterId: g.character?.id, type:'AUTO_ROUTE',mapId:'village',nodeId:hidden});
 g.command({characterId: g.character?.id, type:'START_MAP',mapId:'snow'});assert.equal(g.state.autoRoute,null);
 g.command({characterId: g.character?.id, type:'START_MAP',mapId:'village'});g.advance();g.choose('left');g.advance();
 g.command({type:'AUTO_ROUTE',mapId:'village',nodeId:map.rootId});assert.equal(g.state.reservedRoute.nodeId,map.rootId);
 g.command({type:'AUTO_ROUTE',mapId:'village',nodeId:root.edges.right});assert.equal(g.state.reservedRoute.nodeId,root.edges.right);assert.equal(g.state.autoRoute,null);
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


test('all maps persist an unreachable goal across defeat, HOME, restore and repeated journeys until actual arrival',()=>{
 for(const mapId of ['village','volcano','snow','desert','beach']) {
  let g=make();reveal(g);g.command({type:'START_MAP',mapId});g.advance();const map=g.state.maps[mapId],root=map.nodes[map.rootId];g.choose('left');
  const target=map.nodes[root.edges.right].edges.left, before=structuredClone(g.state);
  g.command({type:'AUTO_ROUTE',mapId,nodeId:target});const goal=structuredClone(g.state.reservedRoute);
  assert.deepEqual(goal,{mapId,nodeId:target,startRun:g.state.run+1});assert.equal(g.state.autoRoute,null);assert.equal(g.state.departureMapId,mapId);
  for(const k of ['phase','currentNodeId','path','remaining','run'])assert.deepEqual(g.state[k],before[k]);
  assert.match(mapSVG(g.snapshot()),/다음 모험 예약/);assert.equal(g.snapshot().routeGoal.pending,true);
  g=new Game(config,structuredClone(g.state),quiet);assert.deepEqual(g.state.reservedRoute,goal);
  g.advance();assert.equal(g.state.phase,'CHOICE_WAIT');assert.equal(g.state.autoRoute,null);g.finish(true);assert.deepEqual(g.state.reservedRoute,goal);
  g=new Game(config,structuredClone(g.state),quiet);g.advance();assert.equal(g.state.phase,'HOME');assert.deepEqual(g.state.reservedRoute,goal);
  g=new Game(config,structuredClone(g.state),quiet);g.advance();assert.equal(g.state.mapId,mapId);assert.equal(g.state.currentNodeId,root.edges.right);assert.ok(g.state.autoRoute);assert.equal(g.snapshot().routeGoal.pending,false);
  // Fail again while following the reserved goal. It must be retried, not lost.
  g.finish(true);g.advance();g=new Game(config,structuredClone(g.state),quiet);g.advance();assert.equal(g.state.currentNodeId,root.edges.right);assert.deepEqual(g.state.reservedRoute,goal);
  g.advance();assert.equal(g.state.phase,'TRAVEL');assert.equal(g.state.currentNodeId,target);assert.ok(g.state.reservedRoute);
  g=new Game(config,structuredClone(g.state),quiet);assert.ok(g.state.reservedRoute);g.advance();assert.equal(g.state.phase,'CHOICE_WAIT');assert.equal(g.state.autoRoute,null);assert.equal(g.state.reservedRoute,null);assert.equal(g.snapshot().routeGoal,null);
  assert.equal(new Game(config,structuredClone(g.state),quiet).state.reservedRoute,null);
 }
});
test('latest selection replaces reservation; cancellation clears both and explicit departure changes keep the reserved goal',()=>{
 const g=make();reveal(g);g.advance();const map=g.state.maps.village,root=map.nodes[map.rootId];g.choose('left');
 const select=nodeId=>g.command({type:'AUTO_ROUTE',mapId:'village',nodeId});
 select(root.edges.right);select(map.rootId);assert.equal(g.state.reservedRoute.nodeId,map.rootId);
 const child=map.nodes[g.state.currentNodeId].edges.left;select(child);assert.equal(g.state.reservedRoute,null);assert.equal(g.state.autoRoute.nodeId,child);
 select(root.edges.right);assert.equal(g.state.autoRoute,null);const saved=structuredClone(g.state.reservedRoute);
 g.command({type:'START_MAP',mapId:'snow'});assert.deepEqual(g.state.reservedRoute,saved);
 g.command({type:'CANCEL_ROUTE'});assert.equal(g.state.autoRoute,null);assert.equal(g.state.reservedRoute,null);
});
test('reserved start node clears at next departure, and terminal destinations clear before region or battle transitions',()=>{
 const g=make();reveal(g);g.advance();g.choose('left');const map=g.state.maps.village;
 g.command({type:'AUTO_ROUTE',mapId:'village',nodeId:map.rootId});g.finish(false);g.advance();g.advance();assert.equal(g.state.currentNodeId,map.rootId);assert.equal(g.state.phase,'CHOICE_WAIT');assert.equal(g.state.reservedRoute,null);
 for(const m of Object.values(g.state.maps))for(const kind of ['deadend','exit','boss']) {
  const node=Object.values(m.nodes).find(n=>n.kind===kind);if(!node)continue;
  Object.assign(g.state,{mapId:m.id,theme:m.id,currentNodeId:node.id,step:node.depth,runGold:g.state.gold,risk:0,reservedRoute:{mapId:m.id,nodeId:node.id,startRun:g.state.run},autoRoute:{mapId:m.id,nodeId:node.id}});
  g.phase('TRAVEL',1);g.advance();assert.equal(g.state.autoRoute,null);assert.equal(g.state.reservedRoute,null);
 }
});
test('manual deviation retains deferred goal and map regeneration discards obsolete destinations; old saves remain compatible',()=>{
 const g=make();reveal(g);g.advance();const map=g.state.maps.village,root=map.nodes[map.rootId];g.choose('left');const target=map.nodes[root.edges.right].edges.left;
 g.command({type:'AUTO_ROUTE',mapId:'village',nodeId:target});const goal=structuredClone(g.state.reservedRoute);g.finish(false);g.advance();g.advance();g.state.autoRoute=null;g.phase('CHOICE_WAIT',config.choiceMs);
 g.choose('right');g.advance();assert.deepEqual(g.state.reservedRoute,goal);assert.equal(g.state.autoRoute,null);
 const restored=new Game(config,structuredClone(g.state),quiet);assert.deepEqual(restored.state.reservedRoute,goal);regenerateAdminMaps(restored);assert.equal(restored.state.reservedRoute,null);assert.equal(restored.state.autoRoute,null);
 const old=structuredClone(g.state);delete old.reservedRoute;old.autoRoute={mapId:'village',nodeId:target};const legacy=new Game(config,old,quiet);assert.equal(legacy.state.reservedRoute,null);assert.deepEqual(legacy.state.autoRoute,old.autoRoute);
 const invalid=structuredClone(g.state);invalid.reservedRoute={mapId:'village',nodeId:'deleted-node',startRun:0};assert.equal(new Game(config,invalid,quiet).state.reservedRoute,null);
});
