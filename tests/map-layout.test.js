import test from 'node:test';
import assert from 'node:assert/strict';
import { generateMap, MAP_DEFS, upgradeMap } from '../src/maps.js';
import { generateLegacyMap } from './fixtures/maps-v1.js';
import { layoutMap, MAP_NODE_WIDTH } from '../public/map-layout.js';
import { nodeLabels } from '../public/map-navigation.js';
import { mapSVG, exploredMap } from '../public/map-view.js';
function rng(seed) { let x=seed; return n=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x%n;}; }
function intersects(a,b,c,d) {
 const vertical=a[0]===b[0],otherVertical=c[0]===d[0];
 const between=(n,a,b)=>n>=Math.min(a,b)&&n<=Math.max(a,b);
 if(vertical!==otherVertical){if(!vertical)return intersects(c,d,a,b);return between(a[0],c[0],d[0])&&between(c[1],a[1],b[1]);}
 if(vertical){return a[0]===c[0]&&Math.max(Math.min(a[1],b[1]),Math.min(c[1],d[1]))<=Math.min(Math.max(a[1],b[1]),Math.max(c[1],d[1]));}
 return a[1]===c[1]&&Math.max(Math.min(a[0],b[0]),Math.min(c[0],d[0]))<=Math.min(Math.max(a[0],b[0]),Math.max(c[0],d[0]));
}
test('new and migrated trees have left/right children below parents, disjoint labels and uncrossed orthogonal edges',()=>{
 for(let seed=1;seed<=12;seed++)for(const id of Object.keys(MAP_DEFS))for(const map of [generateMap(id,rng(seed)),upgradeMap(generateLegacyMap(id,rng(seed)))]){
  const {positions,edges,width,height}=layoutMap(map);
  for(const node of Object.values(map.nodes)){
   const p=positions[node.id];assert.ok(p.x>=MAP_NODE_WIDTH/2&&p.x<=width-MAP_NODE_WIDTH/2);assert.ok(p.y>0&&p.y<height);
   if(node.edges){assert.ok(positions[node.edges.left].x<p.x);assert.ok(positions[node.edges.right].x>p.x);for(const to of Object.values(node.edges))assert.ok(positions[to].y>p.y);}
  }
  for(let depth=0;depth<=10;depth++){
   const row=Object.values(map.nodes).filter(n=>n.depth===depth).map(n=>positions[n.id].x).sort((a,b)=>a-b);
   for(let i=1;i<row.length;i++)assert.ok(row[i]-row[i-1]>=MAP_NODE_WIDTH+39);
  }
  for(const edge of edges)for(let i=1;i<edge.points.length;i++)assert.ok(edge.points[i][0]===edge.points[i-1][0]||edge.points[i][1]===edge.points[i-1][1]);
  for(let i=0;i<edges.length;i++)for(let j=i+1;j<edges.length;j++){
   if(edges[i].from===edges[j].from)continue; // The two choices intentionally share their parent's vertical stem.
   for(let a=1;a<4;a++)for(let b=1;b<4;b++)assert.equal(intersects(edges[i].points[a-1],edges[i].points[a],edges[j].points[b-1],edges[j].points[b]),false,`${id}/${seed}: ${edges[i].from} and ${edges[j].from}`);
  }
 }
});
test('unexplored forks reveal neither destinations, events nor deeper topology',()=>{
 const map=generateMap('village',rng(7)),root=map.nodes[map.rootId];
 const state={mapGraph:map,currentNodeId:root.id,path:[],checkpointHistory:[{mapId:'snow'}]};
 const before=structuredClone(state),visible=exploredMap(state),svg=mapSVG(state);
 assert.equal(Object.keys(visible.nodes).length,3);
 assert.equal(visible.depth,1);
 for(const id of Object.values(root.edges))assert.deepEqual(visible.nodes[id],{id,depth:1,kind:'unknown',label:'미탐험'});
 assert.match(svg,/현재 위치/);assert.match(svg,/왼쪽/);assert.match(svg,/오른쪽/);
 assert.doesNotMatch(svg,/통과 기록|data-kind="(?:boss|exit|deadend)"/);
 for(const id of map.terminalIds)assert.ok(!svg.includes(map.nodes[id].label));
 assert.doesNotMatch(svg,/<path[^>]+d="[^"]*[LQCA]/);
 assert.deepEqual(state,before);
 // Changing everything behind the unknown choices cannot change the picture.
 const altered=structuredClone(state);
 for(const node of Object.values(altered.mapGraph.nodes))if(node.id!==root.id){node.kind='boss';node.label='숨겨진 보스';delete node.edges;}
 assert.equal(mapSVG(altered),svg);
});
test('arrival reveals destinations while unchosen siblings remain anonymous; saved exploration stays visible',()=>{
 for(const mapId of Object.keys(MAP_DEFS)){
  const map=generateMap(mapId,rng(7));
  for(const target of Object.values(map.nodes).filter(n=>!n.edges)){
   const parents=new Map();for(const n of Object.values(map.nodes))for(const [direction,to]of Object.entries(n.edges||{}))parents.set(to,{from:n.id,to,direction});
   const path=[];let id=target.id;while(parents.has(id)){const edge=parents.get(id);path.unshift(edge);id=edge.from;}
   const state={mapGraph:map,currentNodeId:path.at(-1).from,path:path.slice(0,-1),checkpointHistory:[{mapId:target.region}]};
   const hidden=exploredMap(state);assert.equal(hidden.nodes[target.id].kind,'unknown');assert.equal(hidden.nodes[target.id].edges,undefined);
   state.currentNodeId=target.id;state.path=path;
   const svg=mapSVG(state);assert.ok(svg.includes(nodeLabels(map)[target.id]));if(target.kind!=='deadend')assert.ok(svg.includes(target.label));assert.match(svg,/map-edge visited/);
   assert.equal(exploredMap(state).nodes[target.id].kind,target.kind);
   state.exploredNodes={[map.id]:[map.rootId,...path.map(p=>p.to)]};state.path=[];state.currentNodeId=map.rootId;
   const restored=mapSVG(state,1,Object.entries(MAP_DEFS).map(([id,def])=>({id,name:def.name}))); assert.ok(restored.includes(nodeLabels(map)[target.id]));
   if(target.kind==='exit'){assert.ok(restored.includes(`${MAP_DEFS[target.region].name} · 통과 기록`));assert.ok(!restored.includes('체크포인트'));}
  }
 }
});
