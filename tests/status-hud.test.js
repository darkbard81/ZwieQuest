import test from 'node:test';
import assert from 'node:assert/strict';
import { statusPresentation } from '../public/status-effects-view.js';
import { initializeStatuses,applyStatus,applyMirror,statusViews } from '../src/status-effects.js';
import { skillDefinition } from '../src/skills.js';

test('status sweep advances clockwise from zero with game rate and buff decay, clamps at expiry and can freeze',()=>{
 const effect={id:'hobbled',name:'절뚝거림',sourceSkillName:'무력화',durationMs:15000,remainingMs:15000,decayRate:1};
 assert.equal(statusPresentation(effect).angle,0);
 assert.deepEqual(statusPresentation(effect,3750),{remainingMs:11250,angle:90,label:'절뚝거림(11.3초)'});
 assert.equal(statusPresentation(effect,3750,2).angle,180);
 assert.equal(statusPresentation({...effect,decayRate:.5},3750,2).angle,90);
 assert.equal(statusPresentation(effect,30000).angle,360);
 assert.equal(statusPresentation(effect,30000).remainingMs,0);
 assert.equal(statusPresentation(effect,30000,1,false).remainingMs,15000);
});
test('origin and original duration survive JSON save; shorter reapply does not change source or reset sweep',()=>{
 const b={};initializeStatuses(b);
 applyStatus(b,'enemy','hobbled',15000,{INT:4},'hero',{},'hamstring');
 b.statuses.enemy[0].remainingMs=12000;
 applyStatus(b,'enemy','hobbled',1000,{INT:0},'hero',{},'binding-strike');
 let view=statusViews(JSON.parse(JSON.stringify(b)),'enemy',skillDefinition)[0];
 assert.equal(view.sourceSkillName,'무력화');assert.equal(view.iconPath,'/assets/skills/hamstring-v1.webp');assert.equal(view.durationMs,18000);assert.equal(view.remainingMs,12000);
 applyStatus(b,'enemy','hobbled',20000,{INT:0},'hero',{},'binding-strike');view=statusViews(b,'enemy',skillDefinition)[0];assert.equal(view.durationMs,20000);assert.equal(view.sourceSkillName,'발목 묶기');assert.equal(statusPresentation(view).angle,0);
});
test('mirror and promoted statuses retain originating artwork and buff decay; legacy effect has an honest source fallback',()=>{
 const b={};initializeStatuses(b);applyStatus(b,'hero','courageous',30000,{INT:0},'hero',{},'resolve-inspiration');applyStatus(b,'hero','nimble',30000,{INT:0},'hero',{},'dexterity-inspiration');applyMirror(b,'hero',60000,{INT:4});
 const views=statusViews(b,'hero',skillDefinition),swift=views.find(s=>s.id==='swift'),mirror=views.find(s=>s.id==='mirrored-image');
 assert.equal(swift.sourceSkillName,'민첩 고양');assert.equal(swift.decayRate,.5);assert.equal(mirror.sourceSkillName,'반사된 형상');assert.equal(mirror.durationMs,72000);
 const old={statuses:{hero:[{id:'weakened',remainingMs:4321}],enemy:[]}};initializeStatuses(old);const before=statusViews(old,'hero',skillDefinition)[0];old.statuses.hero[0].remainingMs=3000;
 assert.equal(statusViews(old,'hero',skillDefinition)[0].durationMs,4321);assert.equal(before.sourceSkillName,null);assert.equal(before.iconPath,'/assets/skills/weakening-strike-v1.webp');
});
