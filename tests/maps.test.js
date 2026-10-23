import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateMap, MAP_DEFS, MAP_VERSION, MAP_GENERATION_VERSION, reachable, upgradeMap, maxNodes } from '../src/maps.js';
import { Game } from '../src/game.js';
import { generateLegacyMap } from './fixtures/maps-v1.js';
import { generatePreviousMap } from './fixtures/maps-v2.js';
const depthCaps=[1,2,4,8,16,20,18,16,14,12,10];
const config=JSON.parse(readFileSync(new URL('../config.json',import.meta.url)));
function rng(seed){let x=seed;return n=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x%n;};}
function route(map,target){const queue=[[map.rootId,[]]],seen=new Set();while(queue.length){const [id,path]=queue.shift();if(id===target)return path;if(seen.has(id))continue;seen.add(id);for(const [direction,to]of Object.entries(map.nodes[id].edges||{}))queue.push([to,[...path,direction]]);}throw Error('Unreachable');}
function traverse(g,path){if(g.state.phase==='HOME')g.advance();for(const direction of path){assert.equal(g.state.phase,'CHOICE_WAIT');g.command({characterId: g.character?.id, type:'CHOOSE',direction,choiceId:g.state.choiceId});g.advance();let guard=0;while(['BATTLE','TREASURE'].includes(g.state.phase)&&guard++<100)g.advance();assert.ok(guard<100);}}
function assertTree(map) {
 const parents=new Map(Object.keys(map.nodes).map(id=>[id,0]));
 for(const node of Object.values(map.nodes))if(node.edges){
  assert.notEqual(node.edges.left,node.edges.right);
  for(const to of Object.values(node.edges)){assert.equal(map.nodes[to].depth,node.depth+1);parents.set(to,parents.get(to)+1);}
 }
 assert.equal(reachable(map).size,Object.keys(map.nodes).length);
 for(const [id,count] of parents)assert.equal(count,id===map.rootId?0:1,id);
}

test('legacy graph migration preserves every node, destination and selected path without merges',()=>{
 for(let seed=1;seed<=20;seed++)for(const id of Object.keys(MAP_DEFS)){
  const old=generateLegacyMap(id,rng(seed));
  for(const target of old.terminalIds){
   let from=old.rootId;const path=route(old,target).map(direction=>{const to=old.nodes[from].edges[direction],edge={from,to,direction};from=to;return edge;});
   const upgraded=upgradeMap(old,path);assertTree(upgraded);assert.equal(upgraded.version,MAP_VERSION);
   for(const node of Object.values(old.nodes)){const {edges,...before}=node,{edges:afterEdges,...after}=upgraded.nodes[node.id];assert.deepEqual(after,before);}
   for(const edge of path)assert.equal(upgraded.nodes[edge.from].edges[edge.direction],edge.to);
   assert.deepEqual(upgraded.terminalIds,old.terminalIds);assert.equal(upgradeMap(upgraded),upgraded);
   assert.ok(Object.keys(upgraded.nodes).length<=2*Object.keys(old.nodes).length-1);
  }
 }
});

test('version-1 and version-2 saves preserve in-flight phase, timer, choices, combat, rewards, route and checkpoint history on restart',()=>{
 for(const generateSavedMap of [generateLegacyMap,generatePreviousMap])for(const phase of ['HOME','CHOICE_WAIT','TRAVEL','BATTLE','TREASURE','DOWNED','RETURN_HOME']){
  const g=new Game(config,null,rng(7));g.create({name: '모험가', appearanceId: 'warrior'});g.state.homePaused=false;
  g.state.maps=Object.fromEntries(Object.keys(MAP_DEFS).map(id=>[id,generateSavedMap(id,rng(7))]));
  // Keep the migration setup independent of encounter rolls and generator RNG consumption.
  g.rng=n=>n===10000?9999:Math.min(11,n-1);
  const map=g.state.maps.village;g.state.currentNodeId=map.rootId;g.advance();
  const target=Object.values(map.nodes).find(n=>n.depth===2&&n.kind==='path');
  for(const direction of route(map,target.id)){g.choose(direction);if(g.state.step<2)g.advance();}
  g.state.risk=0;g.beginBattle();g.state.battle.ap=2;g.phase(phase,1234);
  g.state.lastBossRewardId='saved-reward';g.state.checkpointHistory=[{mapId:'snow',nodeId:g.state.maps.snow.rootId,firstPassedAt:123}];
  const saved=structuredClone(g.state),restored=new Game(config,structuredClone(saved),()=>{throw Error('Migration must not reroll');});
  for(const key of ['phase','remaining','duration','phaseStartedAt','choiceId','battle','enemy','hp','gold','xp','level','inventory','equipment','currentNodeId','path','run','runGold','step','lastBossRewardId','checkpointHistory'])assert.deepEqual(restored.state[key],saved[key],`${phase}/${key}`);
  for(const migrated of Object.values(restored.state.maps))assertTree(migrated);
  if(generateSavedMap===generatePreviousMap){const expected=structuredClone(saved.maps);for(const map of Object.values(expected))for(const node of Object.values(map.nodes))delete node.event;assert.deepEqual(restored.state.maps,expected);}
  const again=new Game(config,structuredClone(restored.state),()=>{throw Error('Unexpected reroll');});assert.deepEqual(again.state,restored.state);
 }
});
test('all six maps over 100 seeds share full early branching, tapering depth caps including dead ends, and reachable depth-10 destinations',()=>{
 for(const id of Object.keys(MAP_DEFS)){
  const shapes=new Set();
  for(let seed=1;seed<=100;seed++){
  const map=generateMap(id,rng(seed)),all=Object.values(map.nodes),final=all.filter(n=>n.depth===10),seen=reachable(map);
  assert.equal(seen.size,all.length);assert.equal(map.depth,10);assert.equal(final.length,id==='village'?10:2);assert.equal(map.version,MAP_VERSION);assert.equal(map.generationVersion,MAP_GENERATION_VERSION);assert.ok(all.every(n=>!Object.hasOwn(n,'event')));
  for(let d=0;d<=10;d++){
   const row=all.filter(n=>n.depth===d);assert.ok(row.length<=maxNodes(d,10,final.length));
   if(d<=4)assert.equal(row.length,depthCaps[d]);
   if(d<=3){assert.equal(row.length,2**d);assert.ok(row.every(n=>n.edges),`${id}/${seed}: early dead end at ${d}`);}
   else assert.ok(row.length>0&&row.length<=depthCaps[d],`${id}/${seed}: ${row.length} total nodes at ${d}`);
  }
  assert.ok(all.some(n=>n.kind==='deadend'&&n.depth>=4&&n.depth<10));
  assert.ok(all.filter(n=>n.kind==='exit'||n.kind==='boss').every(n=>n.depth===10));
  if(id==='village'){assert.equal(final.filter(n=>n.kind==='deadend').length,5);assert.deepEqual(final.filter(n=>n.kind==='exit').map(n=>n.region).sort(),['beach','desert','old_forest','snow','volcano']);}else assert.equal(final.filter(n=>n.kind==='boss').length,1);
  for(const node of all){if(node.edges){assert.deepEqual(Object.keys(node.edges).sort(),['left','right']);for(const to of Object.values(node.edges)){assert.equal(map.nodes[to].depth,node.depth+1);assert.ok(seen.has(to));}}else assert.ok(['deadend','exit','boss'].includes(node.kind));}
  assertTree(map);
  if(seed<=30){assert.deepEqual(generateMap(id,rng(seed)),map);shapes.add(Array.from({length:11},(_,d)=>all.filter(n=>n.depth===d).length).join(','));}
  }
  assert.ok(shapes.size>1,`${id} always generates the same layer widths`);
 }
});
test('extreme RNG values respect default depth caps and terminal destinations',()=>{
 for(const id of Object.keys(MAP_DEFS)){
  for(const random of [()=>0,n=>n-1]){
   const map=generateMap(id,random);assertTree(map);
   for(let d=1;d<=10;d++){const count=Object.values(map.nodes).filter(n=>n.depth===d).length;assert.ok(count<=depthCaps[d]);assert.ok(count<=maxNodes(d,10,id==='village'?10:2));}
   assert.equal(Object.values(map.nodes).filter(n=>n.kind===(id==='village'?'exit':'boss')).length,id==='village'?5:1);
  }
 }
});
test('generation-3 saved trees above the new cap retain their geometry and exploration on reload',()=>{
 const g=new Game(config,null,n=>n-1);g.create({name:'모험가',appearanceId:'warrior'});
 for(const map of Object.values(g.state.maps))map.generationVersion=3;
 const map=g.state.maps.village,parent=Object.values(map.nodes).find(n=>n.depth===5&&!n.edges);
 parent.kind='path';parent.label='기존 경로';delete parent.sideBranch;parent.edges={};
 for(const direction of ['left','right']){
  const id=`saved-v3:${direction}`;
  map.nodes[id]={id,depth:6,kind:'deadend',label:'막다른 길',sideBranch:true};parent.edges[direction]=id;
 }
 assertTree(map);assert.equal(Object.values(map.nodes).filter(n=>n.depth===6).length,20);
 g.state.exploredNodes.village.push(parent.id,parent.edges.left);
 const saved=structuredClone(g.state),restored=new Game(config,structuredClone(saved),()=>{throw Error('Saved maps must not reroll');});
 assert.deepEqual(restored.state.maps,saved.maps);assert.deepEqual(restored.state.exploredNodes,saved.exploredNodes);
});
test('each village exit transfers to its region and checkpoint passage history survives serialized restart',()=>{
 for(const region of ['volcano','snow','desert','beach']){
  const g=new Game(config,null,rng(7));g.create({name: '모험가', appearanceId: 'warrior'});g.state.homePaused=false;g.rng=n=>n===10000?9999:Math.min(11,n-1);
  const map=g.state.maps.village,target=Object.values(map.nodes).find(n=>n.kind==='exit'&&n.region===region),path=route(map,target.id);traverse(g,path.slice(0,-1));
  g.character.hp=7;const run=g.state.run,runGold=g.state.runGold,eventSeq=g.state.eventSeq;
  traverse(g,path.slice(-1));
  assert.equal(g.state.phase,'CHOICE_WAIT');assert.equal(g.state.remaining,config.choiceMs);assert.equal(g.character.hp,7);assert.equal(g.state.run,run);assert.equal(g.state.runGold,runGold);
  assert.equal(g.events.filter(e=>e.seq>eventSeq&&['home','depart'].includes(e.type)).length,0);
  assert.throws(()=>g.command({characterId: g.character?.id, type:'SELECT_CHARACTER',characterId:g.character.id}),/여관/);
  assert.equal(g.state.mapId,region);assert.equal(g.state.theme,region);assert.equal(g.state.checkpointHistory[0].mapId,region);assert.equal(g.state.checkpointHistory.length,1);assert.equal(g.state.currentNodeId,g.state.maps[region].rootId);
  const restored=new Game(config,JSON.parse(JSON.stringify(g.state)));assert.deepEqual(restored.state.checkpointHistory,g.state.checkpointHistory);assert.deepEqual(restored.state.maps,g.state.maps);assert.equal(restored.state.currentNodeId,g.state.currentNodeId);
  assert.equal(restored.state.phase,'CHOICE_WAIT');assert.equal(restored.state.choiceId,g.state.choiceId);
  restored.tick(config.choiceMs,1);assert.equal(restored.state.phase,'TRAVEL');assert.equal(restored.state.step,1);assert.equal(restored.state.run,run);
  restored.finish(true);restored.advance();assert.equal(restored.state.mapId,'village');assert.equal(restored.state.currentNodeId,restored.state.maps.village.rootId);assert.equal(restored.state.checkpointHistory[0].mapId,region);
 }
});
test('regional boss battle rewards once and returns HOME; checkpoint passage records never choose return location',()=>{
 const g=new Game(config,null,rng(4));g.create({name: '모험가', appearanceId: 'wizard'});g.state.homePaused=false;g.rng=n=>n===10000?9999:Math.min(11,n-1);const village=g.state.maps.village;
 traverse(g,route(village,Object.values(village.nodes).find(n=>n.kind==='exit'&&n.region==='snow').id));
 g.character.hp=10000;
 const map=g.state.maps.snow;const path=route(map,map.terminalIds[0]);
 for(let i=0;i<path.length;i++){g.command({characterId: g.character?.id, type:'CHOOSE',direction:path[i],choiceId:g.state.choiceId});g.advance();if(i===path.length-1)break;while(['BATTLE','TREASURE'].includes(g.state.phase))g.advance();}
 assert.equal(g.state.enemy.boss,true);assert.equal(g.state.currentNodeId,map.terminalIds[0]);assert.equal(g.state.step,10);
 g.character.hp=10000;g.state.enemy.hp=1;g.state.enemy.DEF=-100;g.state.battle.actor='hero';g.state.battle.attacks=0;g.battleAction('hero');assert.equal(g.state.phase,'TREASURE');assert.equal(g.state.bossDefeats,1);
 const gold=g.state.gold,items=g.state.inventory.length,seq=g.state.eventSeq;g.reward('boss');assert.equal(g.state.gold,gold);assert.equal(g.state.inventory.length,items);assert.equal(g.state.eventSeq,seq);
 g.advance();assert.equal(g.state.phase,'RETURN_HOME');g.advance();assert.equal(g.state.phase,'HOME');assert.equal(g.state.mapId,'village');assert.equal(g.state.currentNodeId,g.state.maps.village.rootId);g.advance();assert.equal(g.state.mapId,'village');assert.equal(g.state.checkpointHistory.length,1);
});
test('saved regional HOME resumes without resting or starting another journey; village HOME stays intact',()=>{
 for(const region of ['volcano','snow','desert','beach']){
  const g=new Game(config,null,rng(7));g.create({name: '모험가', appearanceId: 'warrior'});g.state.homePaused=false;g.advance();g.enterRegion(region);g.phase('HOME',config.homeMs);g.character.hp=7;
  const saved=JSON.parse(JSON.stringify(g.state)),restored=new Game(config,saved,rng(7));
  assert.equal(restored.state.phase,'CHOICE_WAIT');assert.equal(restored.character.hp,7);assert.equal(restored.state.run,g.state.run);assert.equal(restored.state.runGold,g.state.runGold);
  assert.deepEqual(restored.state.checkpointHistory,g.state.checkpointHistory);assert.equal(restored.state.completed,g.state.completed);
  restored.tick(config.choiceMs,1);assert.equal(restored.state.mapId,region);assert.equal(restored.state.step,1);assert.equal(restored.state.phase,'TRAVEL');
 }
 const g=new Game(config,null,rng(7));g.create({name: '모험가', appearanceId: 'warrior'});g.state.homePaused=false;const saved=JSON.parse(JSON.stringify(g.state));
 const restored=new Game(config,saved);assert.equal(restored.state.phase,'HOME');assert.equal(restored.state.remaining,config.homeMs);assert.equal(restored.events.length,0);
});
test('early and depth-10 dead ends return HOME without removing saved maps',()=>{
 const g=new Game(config,null,rng(1));g.create({name: '모험가', appearanceId: 'warrior'});g.state.homePaused=false;g.rng=n=>n===10000?9999:Math.min(11,n-1);const map=g.state.maps.village;const dead=Object.values(map.nodes).find(n=>n.sideBranch)||map.nodes[map.terminalIds[0]];
 traverse(g,route(map,dead.id));assert.equal(g.state.phase,'RETURN_HOME');g.advance();assert.equal(g.state.currentNodeId,map.rootId);assert.equal(Object.keys(g.state.maps).length,6);
});
test('every region dead end returns HOME and passage history is unique and non-functional',()=>{
 for(const region of ['volcano','snow','desert','beach']){const g=new Game(config,null,rng(1));g.create({name: '모험가', appearanceId: 'warrior'});g.state.homePaused=false;g.rng=n=>n===10000?9999:Math.min(11,n-1);g.enterRegion(region);const record=structuredClone(g.state.checkpointHistory);g.enterRegion(region);assert.deepEqual(g.state.checkpointHistory,record);const map=g.state.maps[region],dead=Object.values(map.nodes).find(n=>n.kind==='deadend');assert.ok(dead);traverse(g,route(map,dead.id));assert.equal(g.state.phase,'RETURN_HOME');g.advance();assert.equal(g.state.mapId,'village');assert.equal(g.state.currentNodeId,g.state.maps.village.rootId);assert.deepEqual(g.state.checkpointHistory,record);}
});

test('exploration survives returning home, another run and a save reload without revealing unchosen nodes',()=>{
 const g=new Game(config,null,rng(7));g.create({name: '모험가', appearanceId: 'warrior'});g.state.homePaused=false;g.advance();
 const map=g.state.maps.village,root=map.nodes[map.rootId];
 assert.deepEqual(g.state.exploredNodes.village,[root.id]);
 g.choose('left');
 assert.deepEqual(new Set(g.state.exploredNodes.village),new Set([root.id,root.edges.left]));
 g.finish(true);g.advance();g.advance();
 assert.deepEqual(g.state.path,[]);
 const saved=structuredClone(g.state),loaded=new Game(config,saved,rng(7));
 assert.deepEqual(loaded.state.exploredNodes.village,g.state.exploredNodes.village);
 loaded.choose('right');assert.ok(loaded.state.exploredNodes.village.includes(root.edges.left));assert.ok(loaded.state.exploredNodes.village.includes(root.edges.right));
 loaded.enterRegion('snow');assert.deepEqual(loaded.state.exploredNodes.snow,[loaded.state.maps.snow.rootId]);assert.deepEqual(loaded.state.exploredNodes.beach,[]);
});
test('saves without exploration recover only retained route and known location',()=>{
 const g=new Game(config,null,rng(7));g.create({name: '모험가', appearanceId: 'warrior'});g.state.homePaused=false;g.advance();g.choose('left');
 const saved=structuredClone(g.state);delete saved.exploredNodes;
 const loaded=new Game(config,saved,()=>{throw Error('No rerolls');});
 assert.deepEqual(new Set(loaded.state.exploredNodes.village),new Set([saved.maps.village.rootId,saved.currentNodeId]));
 assert.deepEqual(loaded.state.exploredNodes.snow,[]);
});
