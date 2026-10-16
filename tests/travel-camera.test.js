import test from 'node:test';
import assert from 'node:assert/strict';
import { createTravelCamera } from '../public/travel-camera.js';
const state=(extra={})=>({mapId:'village',run:1,currentNodeId:'n1',phaseStartedAt:100,phase:'TRAVEL',direction:'right',...extra});
test('starts at center and pans only halfway across the image, toward either edge',()=>{
 for(const direction of ['right','left']) {
  const c=createTravelCamera();c.update(state({direction}),1000);
  assert.equal(c.sample(1000,682).x,-85);
  assert.equal(c.sample(4000,682).x,direction==='right'?-127.5:-42.5);
  assert.equal(c.sample(7000,682).x,direction==='right'?-170:0);
  assert.equal(c.sample(20000,682).x,direction==='right'?-170:0);
 }
});
test('incoming snapshots never reset, jump, or correct the ongoing pan',()=>{
 const c=createTravelCamera();c.update(state({remaining:900}),0);
 let last=c.sample(0,682).x;
 for(let now=16;now<=6000;now+=16){
  c.update(state({remaining:now%3?6000:0,duration:now%2?1:99999}),now);
  const x=c.sample(now,682).x;assert.ok(Math.abs((x-last)+85*16/6000)<1e-8);last=x;
 }
});
test('every new journey starts centered; other phases and reduced motion stay centered',()=>{
 const c=createTravelCamera();c.update(state(),0);c.sample(6000,682);
 c.update(state({phase:'CHOICE_WAIT'}),6100);assert.equal(c.sample(6200,682).x,-85);
 c.update(state({currentNodeId:'n2',direction:'left'}),7000);assert.equal(c.sample(7000,682).x,-85);
 assert.equal(c.sample(9000,682,true).x,-85);
 assert.equal(c.sample(9000,400).x,0);
});
