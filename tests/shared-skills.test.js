import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Game} from '../src/game.js';
import {grantTreasureSkill,skillDefinition} from '../src/skills.js';
import {generateEquipment} from '../src/equipment.js';
const config=JSON.parse(readFileSync(new URL('../config.json',import.meta.url)));
const make=()=>{const g=new Game(config,null,()=>0);g.create({name:'A',appearanceId:'warrior'});g.create({name:'B',appearanceId:'warrior'});return g;};
const cmd=(g,type,extra={})=>g.command({type,characterId:g.character?.id,...extra});
const grant=(g,id)=>{const item={id:'shared-'+id,templateId:id,slot:'skill',name:skillDefinition(id).name,stats:{}};g.character.skills.push(item);return item;};
test('one learned skill equips concurrently with independent slots, automatic mode and mastery toggles',()=>{
 const g=make(),[a,b]=g.state.characters,item=grant(g,'light-weapon-mastery');
 cmd(g,'EQUIP',{itemId:item.id,slotIndex:2});cmd(g,'SET_AUTO_SKILLS',{enabled:true});cmd(g,'TOGGLE_SKILL',{itemId:item.id,enabled:true});
 const first={slots:[...a.skillSlots],auto:a.autoSkills,toggles:{...a.skillToggles}};
 g.selectCharacter(b.id);cmd(g,'EQUIP',{itemId:item.id,slotIndex:4});
 assert.equal(g.snapshot().inventory.filter(i=>i.templateId===item.templateId).length,1);assert.equal(b.skillSlots[4],a.skillSlots[2]);
 assert.equal(b.autoSkills,false);assert.equal(!!b.skillToggles[item.templateId],false);
 cmd(g,'TOGGLE_SKILL',{itemId:item.id,enabled:true});cmd(g,'TOGGLE_SKILL',{itemId:item.id,enabled:false});
 cmd(g,'EQUIP',{itemId:item.id,slotIndex:5});assert.equal(b.skillSlots[4],null);assert.equal(b.skillSlots.filter(id=>id===item.id).length,1);
 cmd(g,'UNEQUIP',{itemId:item.id});assert.deepEqual({slots:a.skillSlots,auto:a.autoSkills,toggles:a.skillToggles},first);
 const restored=new Game(config,JSON.parse(JSON.stringify(g.state)));assert.deepEqual(restored.state.characters.map(c=>({slots:c.skillSlots,auto:c.autoSkills,toggles:c.skillToggles})),g.state.characters.map(c=>({slots:c.skillSlots,auto:c.autoSkills,toggles:c.skillToggles})));
});
test('legacy per-character discoveries merge and duplicate IDs remap without losing queued actions or counts',()=>{
 const g=make(),saved=JSON.parse(JSON.stringify(g.state));delete saved.sharedSkills;
 const [a,b]=saved.characters;a.skills=[{id:'heal-a',templateId:'heal',slot:'skill',stats:{}},{id:'strike-a',templateId:'hamstring',slot:'skill',stats:{}}];b.skills=[{id:'heal-b',templateId:'heal',slot:'skill',stats:{}},{id:'mirror-b',templateId:'mirrored-image',slot:'skill',stats:{}}];
 a.skillSlots=['heal-a','strike-a',null,null,null,null];b.skillSlots=['heal-b','mirror-b',null,null,null,null];saved.activeCharacterId=b.id;
 const h=new Game(config,saved,()=>0);h.beginBattle();h.character.hp=1;h.state.enemy.hp=99999;cmd(h,'USE_SKILL',{itemId:h.character.skillSlots[0],battleId:h.state.battle.id,heroActionSeq:h.state.battle.combatants.hero.actionSeq});
 const pendingSave=JSON.parse(JSON.stringify(h.state));delete pendingSave.sharedSkills;pendingSave.characters[1].skills=pendingSave.characters[1].skills.map(i=>i.templateId==='heal'?{...i,id:'old-b'}:i);pendingSave.characters[1].skillSlots[0]='old-b';pendingSave.battle.pendingSkill.itemId='old-b';pendingSave.battle.skillUseCounts.heal=1;
 const restored=new Game(config,pendingSave,()=>0);assert.equal(restored.state.sharedSkills.length,3);assert.equal(restored.state.battle.pendingSkill.itemId,restored.character.skillSlots[0]);assert.equal(restored.state.battle.skillUseCounts.heal,1);restored.battleAction('hero');assert.equal(restored.state.battle.skillUseCounts.heal,2);assert.equal(restored.events.filter(e=>e.type==='hit').length,0);
 assert.deepEqual(new Game(config,JSON.parse(JSON.stringify(restored.state))).state,restored.state);
});
test('drops are account-wide, survive the last retirement, and remain available to future characters',()=>{
 const g=make(),[a,b]=g.state.characters,drop=grantTreasureSkill(g.state,()=>0);assert.ok(b.skills.some(i=>i.id===drop.id));
 const next=grantTreasureSkill(g.state,()=>0);assert.notEqual(next.templateId,drop.templateId);
 g.retireCharacter(a.id,a.name);g.retireCharacter(b.id,b.name);const saved=new Game(config,JSON.parse(JSON.stringify(g.state)));assert.ok(saved.state.sharedSkills.some(i=>i.id===drop.id));assert.ok(saved.snapshot().inventory.some(i=>i.id===drop.id));
 saved.create({name:'C',appearanceId:'cat'});assert.ok(saved.character.skills.some(i=>i.id===drop.id));cmd(saved,'EQUIP',{itemId:drop.id});assert.ok(saved.character.skillSlots.includes(drop.id));
 const foreign=make();assert.throws(()=>cmd(foreign,'EQUIP',{itemId:drop.id}),/없는 아이템/);
});
test('shared skills cannot be sold individually or in bulk; normal equipment sales still work',()=>{
 const g=make(),item=grant(g,'hamstring'),gold=g.state.gold;
 cmd(g,'EQUIP',{itemId:item.id});g.selectCharacter(g.state.characters[1].id);cmd(g,'EQUIP',{itemId:item.id});
 assert.throws(()=>cmd(g,'SELL',{itemId:item.id}),/판매할 수 없습니다/);assert.equal(g.state.gold,gold);
 const gear=generateEquipment({slot:'weapon',templateId:'dagger',gradeId:'normal',rng:()=>0,specials:false});g.state.inventory.push(gear);
 assert.ok(!g.normalSaleItems().some(i=>i.slot==='skill'));cmd(g,'SELL_NORMAL');assert.ok(!g.state.inventory.includes(gear));assert.equal(g.state.gold,gold+gear.value);assert.ok(g.state.characters.every(c=>c.skillSlots.includes(item.id)));assert.ok(g.state.sharedSkills.includes(item));
});
