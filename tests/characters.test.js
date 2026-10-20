import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Game} from '../src/game.js';
import {stats} from '../src/combat.js';
import {BASE_STATS} from '../src/equipment.js';
import {pointBudget,remainingPoints} from '../src/characters.js';
const config=JSON.parse(readFileSync(new URL('../config.json',import.meta.url)));
const make=()=>new Game(config,null,()=>0);
const create=(g,name='모험가',appearanceId='warrior')=>g.create({name,appearanceId});
const cmd=(g,type,fields={})=>g.command({type,characterId:g.character?.id,...fields});

test('account starts at inn with no characters, no auto departure; 1 to 3 characters get exclusive starter gear and skills',()=>{
 const g=make();for(let n=0;n<20;n++)g.tick(100000,1.5);assert.equal(g.state.phase,'HOME');assert.equal(g.state.run,0);assert.equal(g.snapshot().activeCharacterId,null);
 for(let n=0;n<3;n++){const c=create(g,'동일 외형 '+n);assert.match(c.id,/^[0-9a-f-]{36}$/);assert.equal(c.level,1);assert.deepEqual(Object.values(c.attributes),[0,0,0,0,0,0]);assert.equal(remainingPoints(c),10);assert.equal(c.hp,10);assert.equal(c.skills.length,1);assert.equal(c.skillSlots[0],c.skills[0].id);}
 assert.equal(new Set(g.state.characters.flatMap(c=>[...Object.values(c.equipment),...c.skills.map(i=>i.id)])).size,9);
 for(const c of g.state.characters){const armor=g.state.inventory.find(i=>i.id===c.equipment.armor);assert.equal(armor.templateId,'robe');assert.equal(armor.name,'로브');assert.equal(armor.stats.AR,3);assert.equal(armor.stats.DEX,undefined);}
 assert.equal(g.state.inventory.length,6);assert.ok(g.state.inventory.every(i=>['dagger','robe'].includes(i.templateId)&&i.gradeId==='normal'&&!i.special));
 assert.throws(()=>create(g,'4명'),/최대 3/);assert.equal(g.state.characters.length,3);assert.equal(g.state.inventory.length,6);
 cmd(g,'DEPART');assert.equal(g.state.phase,'CHOICE_WAIT');assert.equal(remainingPoints(g.character),10);assert.throws(()=>create(g,'모험 중'),/여관/);
});
test('names and appearance are validated server-side and no class commands remain',()=>{
 const g=make();for(const name of ['', ' ', 'a'.repeat(21), 'bad\nname', null])assert.throws(()=>create(g,name));assert.throws(()=>create(g,'valid','missing'));
 create(g,'  별빛  ','cat');assert.equal(g.character.name,'별빛');for(const type of ['CLASS','APPEARANCE','CREATE'])assert.throws(()=>cmd(g,type,{classId:'warrior'}),/지원하지/);
});
test('point budget and allocation cannot double grant across multi-level growth, repeated load or invalid requests',()=>{
 const g=make();create(g);assert.deepEqual([1,2,3,4,6,10,20].map(pointBudget),[10,11,11,12,13,15,20]);
 for(const stat of BASE_STATS)cmd(g,'ALLOCATE_STAT',{stat,amount:999});assert.equal(remainingPoints(g.character),4);assert.deepEqual(Object.values(g.character.attributes),Array(6).fill(1));
 for(let i=0;i<4;i++)cmd(g,'ALLOCATE_STAT',{stat:'CON'});const saved=structuredClone(g.state);
 assert.throws(()=>cmd(g,'ALLOCATE_STAT',{stat:'CON'}),/포인트/);assert.throws(()=>cmd(g,'ALLOCATE_STAT',{stat:'HP'}),/기본 능력치/);assert.deepEqual(g.state,saved);
 g.character.xp=376;g.state.risk=0;g.reward('victory');assert.equal(g.character.level,5);assert.equal(remainingPoints(g.character),2);
 const c=structuredClone(g.character);for(let i=0;i<4;i++){const reload=new Game(config,JSON.parse(JSON.stringify(g.state)));assert.deepEqual(reload.character,c);assert.equal(reload.snapshot().attributePoints,2);}
});
test('common stats use invested plus equipped attributes, base defenses and ACC 10, common HP and no class mastery',()=>{
 const g=make();create(g,'first','warrior');const base=stats(g.state,config);g.character.equipment={};let st=stats(g.state,config);
 for(const k of ['ACC','DEF','REF','FOR','WIL','maxHp'])assert.equal(st[k],10,k);
 for(const stat of BASE_STATS)cmd(g,'ALLOCATE_STAT',{stat});g.character.level=10;st=stats(g.state,config);
 assert.equal(st.ACC,14);assert.equal(st.DEF,14);for(const k of ['REF','FOR','WIL'])assert.equal(st[k],15);assert.equal(st.maxHp,60);
 g.character.appearanceId='wizard';assert.deepEqual(stats(g.state,config),st);assert.equal(base.DEX,0);assert.equal(base.REF,10);assert.equal(base.AR,3);
});
test('selected character alone gains XP, retains HP/skills/cooldowns and cannot use another character skill',()=>{
 const g=make(),a=create(g,'첫째'),b=create(g,'둘째');a.hp=3;a.skillCooldowns.heal={readyAt:9999999999999};const before=structuredClone(a);
 cmd(g,'SELECT_CHARACTER',{characterId:b.id});assert.deepEqual(a,before);const aBefore=structuredClone(a);b.hp=2;g.state.risk=0;g.reward('victory');assert.ok(b.xp>0);assert.deepEqual(a,aBefore);assert.equal(b.hp,2);
 assert.throws(()=>cmd(g,'SELECT_CHARACTER',{characterId:a.id}),/여관/);assert.throws(()=>cmd(g,'EQUIP',{itemId:a.skills[0].id}),/없는 아이템/);
 g.phase('HOME',1);cmd(g,'SELECT_CHARACTER',{characterId:a.id});assert.deepEqual(a,before);assert.equal(g.snapshot().inventory.filter(i=>i.slot==='skill').length,1);cmd(g,'DEPART');assert.equal(a.hp,stats(g.state,config).maxHp);assert.equal(b.hp,2);
});
test('exclusive equipment, stale-character commands, foreign IDs, sale and retirement preserve shared possessions',()=>{
 const g=make(),a=create(g,'첫째'),b=create(g,'둘째'),item=a.equipment.weapon;
 cmd(g,'SELECT_CHARACTER',{characterId:b.id});assert.throws(()=>cmd(g,'EQUIP',{itemId:item}),/장착 중/);assert.throws(()=>cmd(g,'SELL',{itemId:item}),/장착 해제/);
 for(const type of ['EQUIP','UNEQUIP','ALLOCATE_STAT','USE_SKILL','DEPART'])assert.throws(()=>cmd(g,type,{characterId:a.id,itemId:item,stat:'STR'}),/변경/);
 assert.throws(()=>cmd(g,'SELECT_CHARACTER',{characterId:'foreign'}),/이 계정/);
 cmd(g,'SELECT_CHARACTER',{characterId:a.id});cmd(g,'UNEQUIP',{itemId:item});cmd(g,'SELECT_CHARACTER',{characterId:b.id});cmd(g,'EQUIP',{itemId:item});assert.deepEqual(g.snapshot().equipmentUsers[item],[b.id]);
 g.state.gold=123;const shared=structuredClone({inventory:g.state.inventory,maps:g.state.maps,checkpointHistory:g.state.checkpointHistory,departureMapId:g.state.departureMapId,gold:g.state.gold});
 assert.throws(()=>cmd(g,'RETIRE_CHARACTER',{characterId:b.id,confirmName:'wrong'}),/이름/);
 cmd(g,'RETIRE_CHARACTER',{characterId:b.id,confirmName:b.name});for(const key of Object.keys(shared))assert.deepEqual(g.state[key],shared[key]);assert.equal(g.character.id,a.id);
 cmd(g,'RETIRE_CHARACTER',{characterId:a.id,confirmName:a.name});assert.equal(g.character,null);for(let i=0;i<30;i++)g.tick(60000,1.5);assert.equal(g.state.run,0);assert.equal(g.state.phase,'HOME');assert.equal(g.state.inventory.length,4);
});
test('server pause persists beyond 15 seconds and restart; resume resets countdown; departure selection survives',()=>{
 const g=make();create(g);cmd(g,'RESUME_HOME');g.tick(14000,1);cmd(g,'PAUSE_HOME');const remaining=g.state.remaining;g.tick(60000,1.5);assert.equal(g.state.remaining,remaining);
 const reloaded=new Game(config,structuredClone(g.state));reloaded.tick(60000,1.5);assert.equal(reloaded.state.phase,'HOME');cmd(reloaded,'RESUME_HOME');assert.equal(reloaded.state.remaining,config.homeMs);reloaded.tick(config.homeMs,1);assert.equal(reloaded.state.phase,'CHOICE_WAIT');
});
test('legacy migration preserves active battle and common state, removes duplicate equipment references and is idempotent',()=>{
 const g=make(),a=create(g,'legacy','wizard');g.state.risk=0;g.beginBattle();g.state.battle.rulesVersion=4;g.state.battle.ap=1;g.state.battle.attacks=2;g.state.battle.skillUseCounts={heal:2};a.hp=3;a.level=8;a.xp=19;a.skillCooldowns.heal={startedAt:10,readyAt:40000,durationMs:39990};
 const old=structuredClone(g.state);delete old.characterVersion;delete old.characters;delete old.activeCharacterId;
 Object.assign(old,{classId:'wizard',appearanceId:'wizard',level:a.level,xp:a.xp,hp:a.hp,equipment:a.equipment,skillSlots:a.skillSlots,skillGrants:a.skillGrants,skillCooldowns:a.skillCooldowns,inactiveClasses:{warrior:{level:4,xp:7,equipment:{...a.equipment}}}});old.inventory.push(...structuredClone(a.skills));
 const before=structuredClone(old),migrated=new Game(config,old),c=migrated.character;
 assert.equal(c.level,8);assert.equal(c.xp,19);assert.equal(c.hp,3);assert.deepEqual(c.equipment,before.equipment);assert.deepEqual(c.skillSlots,before.skillSlots);assert.deepEqual(c.skillCooldowns,before.skillCooldowns);assert.equal(remainingPoints(c),14);
 assert.equal(migrated.state.characters.length,2);assert.equal(migrated.state.characters[1].level,4);assert.deepEqual(migrated.state.characters[1].equipment,{});assert.notEqual(c.skills[0].id,migrated.state.characters[1].skills[0].id);
 for(const key of ['maps','path','gold','remaining','enemy','checkpointHistory','autoRoute','currentNodeId'])assert.deepEqual(migrated.state[key],before[key],key);
 assert.equal(migrated.state.battle.ap,undefined);assert.equal(migrated.state.battle.attacks,undefined);assert.deepEqual(migrated.state.battle.skillUseCounts,{heal:2});assert.equal(migrated.state.classId,undefined);
 assert.deepEqual(new Game(config,structuredClone(migrated.state),()=>{throw Error('No reroll');}).state,migrated.state);
});
