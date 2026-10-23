import test from 'node:test';
import assert from 'node:assert/strict';
import {createPreviewClock} from '../public/inn-preview.js';

test('one-shots hold final pose, replay resets, and reduced motion stays stable',()=>{
 const c=createPreviewClock();c.select('Side_Down');assert.equal(c.tick(1500).frame,23);assert.equal(c.tick(5000).frame,23);c.restart();assert.equal(c.tick(0).frame,0);assert.equal(c.tick(10,true).frame,23);
});
test('half speed, pause and restart do not alter chosen action',()=>{
 const c=createPreviewClock();c.select('Side_Attack');c.setSpeed(.5);assert.equal(c.tick(325).frame,6);c.toggle();assert.equal(c.tick(1000).frame,6);c.restart();assert.equal(c.action,'Side_Attack');assert.equal(c.tick(0).frame,0);
});
test('walking loops; opt-in single action repeats with a pause; tour visits all six actions',()=>{
 const c=createPreviewClock();c.select('Side_Walk');assert.equal(c.tick(1200).frame,0);c.select('Side_Hit');c.setRepeat(true);assert.equal(c.tick(360).frame,23);assert.equal(c.tick(600).frame,0);c.startTour();
 const durations=[2000,2000,1200,650,360,1500],actions=['Front_Victory','Side_Walk','Side_Attack','Side_Hit','Side_Down','Front_Idle'];
 durations.forEach((d,i)=>assert.equal(c.tick(d+600).action,actions[i]));
 c.select('Side_Down');assert.equal(c.tour,false);
});
