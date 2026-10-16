import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateMap, MAP_DEFS, reachable } from '../src/maps.js';
import { Game } from '../src/game.js';
const config=JSON.parse(readFileSync(new URL('../config.json',import.meta.url)));
function rng(seed){let x=seed;return n=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x%n;};}
function route(map,target){const queue=[[map.rootId,[]]],seen=new Set();while(queue.length){const [id,path]=queue.shift();if(id===target)return path;if(seen.has(id))continue;seen.add(id);for(const [direction,to]of Object.entries(map.nodes[id].edges||{}))queue.push([to,[...path,direction]]);}throw Error('Unreachable');}
function traverse(g,path){if(g.state.phase==='HOME')g.advance();for(const direction of path){assert.equal(g.state.phase,'CHOICE_WAIT');g.command({type:'CHOOSE',direction,choiceId:g.state.choiceId});g.advance();let guard=0;while(['BATTLE','TREASURE'].includes(g.state.phase)&&guard++<100)g.advance();assert.ok(guard<100);}}
test('100 generated worlds: exact depth-10 destinations, all reachable, two forward branches and protected routes intact',()=>{
 for(let seed=1;seed<=100;seed++)for(const id of Object.keys(MAP_DEFS)){
  const map=generateMap(id,rng(seed)),all=Object.values(map.nodes),final=all.filter(n=>n.depth===10),seen=reachable(map);
  assert.equal(seen.size,all.length);assert.equal(map.depth,10);assert.equal(final.length,id==='village'?10:1);
  if(id==='village'){assert.equal(final.filter(n=>n.kind==='deadend').length,6);assert.deepEqual(final.filter(n=>n.kind==='exit').map(n=>n.region).sort(),['beach','desert','snow','volcano']);}else assert.equal(final[0].kind,'boss');
  for(const node of all){if(node.edges){assert.deepEqual(Object.keys(node.edges).sort(),['left','right']);for(const to of Object.values(node.edges)){assert.equal(map.nodes[to].depth,node.depth+1);assert.ok(seen.has(to));}}else assert.ok(['deadend','exit','boss'].includes(node.kind));}
  for(const [from,dir,to]of map.protectedEdges)assert.equal(map.nodes[from].edges[dir],to);
 }
});
test('each village exit transfers to its region and checkpoint passage history survives serialized restart',()=>{
 for(const region of ['volcano','snow','desert','beach']){
  const g=new Game(config,null,rng(7));g.create('warrior');g.rng=n=>Math.min(11,n-1);
  const map=g.state.maps.village,target=Object.values(map.nodes).find(n=>n.kind==='exit'&&n.region===region);traverse(g,route(map,target.id));
  assert.equal(g.state.mapId,region);assert.equal(g.state.theme,region);assert.equal(g.state.checkpointHistory[0].mapId,region);assert.equal(g.state.checkpointHistory.length,1);assert.equal(g.state.currentNodeId,g.state.maps[region].rootId);
  const restored=new Game(config,JSON.parse(JSON.stringify(g.state)));assert.deepEqual(restored.state.checkpointHistory,g.state.checkpointHistory);assert.deepEqual(restored.state.maps,g.state.maps);assert.equal(restored.state.currentNodeId,g.state.currentNodeId);
  restored.finish(true);restored.advance();assert.equal(restored.state.mapId,'village');assert.equal(restored.state.currentNodeId,restored.state.maps.village.rootId);assert.equal(restored.state.checkpointHistory[0].mapId,region);
 }
});
test('regional boss battle rewards once and returns HOME; checkpoint passage records never choose return location',()=>{
 const g=new Game(config,null,rng(4));g.create('wizard');g.rng=n=>Math.min(11,n-1);const village=g.state.maps.village;
 traverse(g,route(village,Object.values(village.nodes).find(n=>n.kind==='exit'&&n.region==='snow').id));
 const map=g.state.maps.snow;const path=route(map,map.terminalIds[0]);g.advance();
 for(let i=0;i<path.length;i++){g.command({type:'CHOOSE',direction:path[i],choiceId:g.state.choiceId});g.advance();if(i===path.length-1)break;while(['BATTLE','TREASURE'].includes(g.state.phase))g.advance();}
 assert.equal(g.state.enemy.boss,true);assert.equal(g.state.currentNodeId,map.terminalIds[0]);assert.equal(g.state.step,10);
 g.state.hp=10000;g.state.enemy.hp=1;g.state.battle.actor='hero';g.state.battle.attacks=0;g.battleAction();assert.equal(g.state.phase,'TREASURE');assert.equal(g.state.bossDefeats,1);
 const gold=g.state.gold,items=g.state.inventory.length,seq=g.state.eventSeq;g.reward('boss');assert.equal(g.state.gold,gold);assert.equal(g.state.inventory.length,items);assert.equal(g.state.eventSeq,seq);
 g.advance();assert.equal(g.state.phase,'RETURN_HOME');g.advance();assert.equal(g.state.phase,'HOME');assert.equal(g.state.mapId,'village');assert.equal(g.state.currentNodeId,g.state.maps.village.rootId);g.advance();assert.equal(g.state.mapId,'village');assert.equal(g.state.checkpointHistory.length,1);
});
test('early and depth-10 dead ends return HOME without removing saved maps',()=>{
 const g=new Game(config,null,rng(1));g.create('warrior');g.rng=n=>Math.min(11,n-1);const map=g.state.maps.village;const dead=Object.values(map.nodes).find(n=>n.sideBranch)||map.nodes[map.terminalIds[0]];
 traverse(g,route(map,dead.id));assert.equal(g.state.phase,'RETURN_HOME');g.advance();assert.equal(g.state.currentNodeId,map.rootId);assert.equal(Object.keys(g.state.maps).length,5);
});
test('every region dead end returns HOME and passage history is unique and non-functional',()=>{
 for(const region of ['volcano','snow','desert','beach']){const g=new Game(config,null,rng(1));g.create('warrior');g.rng=n=>Math.min(11,n-1);g.enterRegion(region);const record=structuredClone(g.state.checkpointHistory);g.enterRegion(region);assert.deepEqual(g.state.checkpointHistory,record);const map=g.state.maps[region],dead=Object.values(map.nodes).find(n=>n.kind==='deadend');assert.ok(dead);traverse(g,route(map,dead.id));assert.equal(g.state.phase,'RETURN_HOME');g.advance();assert.equal(g.state.mapId,'village');assert.equal(g.state.currentNodeId,g.state.maps.village.rootId);assert.deepEqual(g.state.checkpointHistory,record);}
});
