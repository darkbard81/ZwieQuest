import test from 'node:test';
import assert from 'node:assert/strict';
import {createHeroAnimator, sampleAnimationFrame, PLAYBACK} from '../public/hero-animation.js';
import {createCombatFeed} from '../public/combat-feedback.js';
import { APPEARANCES } from '../public/appearances.js';
const state=(phase='HOME',extra={})=>({appearanceId:'warrior',mapId:'village',run:1,currentNodeId:'n1',phase,...extra});
const event=(actor,damage=10)=>({type:'hit',hit:{actor,damage}});
test('all appearances share the 24-frame, two-second Idle used by inn previews',()=>{
 for(const appearance of APPEARANCES){
  assert.equal(appearance.idleDurationMs,undefined);assert.equal(appearance.idleFrameCount,undefined);
  const a=createHeroAnimator();a.update(state('HOME',{appearanceId:appearance.id,appearanceId:appearance.appearanceId}),0);
  for(let i=0;i<24;i++){
   const now=(i+0.5)*2000/24;
   assert.equal(a.sample(now).frame,i,appearance.id);
   assert.equal(a.sample(now).frame,sampleAnimationFrame('Front_Idle',now));
  }
  assert.equal(a.sample(1999).frame,23);assert.equal(a.sample(2000).frame,0);assert.equal(a.sample(1000,true).frame,0);
  a.update(state('TRAVEL',{appearanceId:appearance.id}),0);assert.equal(a.sample(600).frame,12);assert.equal(a.sample(1200).frame,0);
 }
});
test('shared sampler loops only Idle/Walk and clamps all one-shot actions',()=>{
 for(const [action,spec] of Object.entries(PLAYBACK)){
  assert.equal(sampleAnimationFrame(action,-1),0);
  assert.equal(sampleAnimationFrame(action,spec.duration/2),12);
  assert.equal(sampleAnimationFrame(action,spec.duration),spec.loop?0:23);
  assert.equal(sampleAnimationFrame(action,spec.duration*2),spec.loop?0:23);
 }
});
test('idle, travel facing, combat neutral and appearance switch',()=>{
 const a=createHeroAnimator();a.update(state(),0);assert.equal(a.sample(300).action,'Front_Idle');
 a.update(state('TRAVEL',{direction:'left'}),400);assert.equal(a.sample(800).mirrored,true);assert.equal(a.sample(800).action,'Side_Walk');
 a.update(state('BATTLE'),900);assert.deepEqual([a.sample(1000).action,a.sample(1000).frame,a.sample(1000).mirrored],['Side_Attack',0,false]);
 a.events([event('hero')],1000);assert.ok(a.sample(1250).frame>0);assert.equal(a.sample(1651).frame,0);
 a.update(state('HOME',{appearanceId:'wizard'}),1800);assert.equal(a.sample(1900).appearanceId,'wizard');assert.equal(a.sample(1900).action,'Front_Idle');
});
test('misses do not hurt; real damage interrupts attack; rapid hits replace instead of queue',()=>{
 const a=createHeroAnimator();a.update(state('BATTLE'),0);a.events([event('enemy',0)],0);assert.equal(a.sample(100).hurt,false);
 a.events([event('hero')],200);a.events([event('enemy')],250);assert.equal(a.sample(300).action,'Side_Hit');
 for(let i=0;i<20;i++)a.events([event('hero')],400+i);assert.equal(a.sample(1070).frame,0);assert.equal(a.sample(1070).action,'Side_Attack');
});
test('final hit finishes before victory, ordinary treasure does not celebrate',()=>{
 const a=createHeroAnimator();a.update(state('BATTLE'),0);a.update(state('TREASURE'),100);a.events([event('hero'),{type:'victory'}],100);
 assert.equal(a.sample(500).action,'Side_Attack');assert.equal(a.sample(800).action,'Front_Victory');assert.equal(a.sample(2800).action,'Front_Idle');
 a.update(state('CHOICE_WAIT'),2900);a.update(state('TREASURE'),3000);assert.equal(a.sample(3200).action,'Front_Idle');
});
test('lethal hit precedes down; final down frame holds through defeated return',()=>{
 const a=createHeroAnimator();a.update(state('BATTLE'),0);a.update(state('DOWNED'),100);a.events([event('enemy')],100);
 assert.equal(a.sample(200).action,'Side_Hit');assert.equal(a.sample(600).action,'Side_Down');assert.equal(a.sample(2300).frame,23);
 a.update(state('RETURN_HOME',{lastSummary:{downed:true}}),2500);assert.equal(a.sample(2600).action,'Side_Down');assert.equal(a.sample(2600).frame,23);
 a.update(state(),2700);assert.equal(a.sample(2800).action,'Front_Idle');
});
test('reload, disconnect and reduced motion do not replay past attack animations',()=>{
 const a=createHeroAnimator();a.update(state('BATTLE',{battle:{lastHit:{actor:'hero',at:Date.now()}}}),0);assert.equal(a.sample(300).frame,0);
 a.events([event('hero')],400);a.clear();assert.equal(a.sample(500).frame,0);
 a.events([event('hero')],600);assert.equal(a.sample(800,true).frame,0);
 const b=createHeroAnimator();b.update(state('DOWNED'),0);assert.equal(b.sample(100).frame,23);
});
test('event feed suppresses history, duplicate, reconnect, stale events and keeps final hit plus victory',()=>{
 const feed=createCombatFeed();const snapshot=(seq,logs)=>({state:{eventSeq:seq},serverTime:10000,logs});
 const hit={seq:2,at:9900,...event('hero')},win={seq:3,at:9901,type:'boss'};
 assert.deepEqual(feed.consume(snapshot(1,[]),false),[]);
 assert.deepEqual(feed.consume(snapshot(3,[win,hit]),true),[hit,win]);
 assert.deepEqual(feed.consume(snapshot(3,[win,hit]),true),[]);
 assert.deepEqual(feed.consume(snapshot(4,[{...hit,seq:4}]),false),[]);
 assert.deepEqual(feed.consume(snapshot(5,[{...hit,seq:5,at:0}]),true),[]);
 assert.deepEqual(feed.consume({state:null},true),[]);
 assert.deepEqual(feed.consume(snapshot(8,[{...hit,seq:8}]),true),[]);
});
test('a new battle at the same node clears the previous transient animation',()=>{
 const a=createHeroAnimator();a.update(state('BATTLE',{battle:{id:'old'}}),0);a.events([event('enemy')],10);assert.equal(a.sample(20).action,'Side_Hit');
 a.update(state('BATTLE',{battle:{id:'new'}}),30);assert.equal(a.sample(40).action,'Side_Attack');assert.equal(a.sample(40).frame,0);assert.equal(a.sample(40).transient,false);
});
