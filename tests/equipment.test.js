import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EQUIPMENT_CATALOG as c, generateEquipment, rollGrade, rollWeaponDamage, chance, validateCatalog } from '../src/equipment.js';
import { attack, effectiveArmor, stats } from '../src/combat.js';
import { Game } from '../src/game.js';
import { itemDetailsHTML, itemIconHTML } from '../public/equipment-view.js';
const config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url)));
const make = cls => { const g = new Game(config, null, n => Math.min(n - 1, 11)); g.create({name: '모험가', appearanceId: cls || 'warrior'});g.state.homePaused=false; g.state.risk = 0; return g; };
const generate = (id, gradeId = 'normal', overrides = {}) => { const t = [...c.weapons, ...c.armors].find(t => t.id === id); return generateEquipment({ slot:t.slot, classId:t.classId || 'wizard', templateId:id, gradeId, rng:()=>0, specials:false, ...overrides }); };

test('all 24 templates and five grades produce saved exact values; halberd has two types', () => {
 assert.equal(c.weapons.length,15); assert.equal(c.armors.length,9); assert.deepEqual(c.weapons.find(t=>t.id==='halberd').damageTypes,['slash','blunt']);
 for(const t of [...c.weapons,...c.armors]) for(const g of c.grades){const i=generate(t.id,g.id);assert.equal(i.rulesVersion,2);assert.equal(i.gradeId,g.id);assert.equal(i.templateId,t.id);assert.equal(i.rarity,g.name);assert.ok(i.id);assert.equal(i.special,null);if(t.slot==='weapon'){assert.equal(i.damageMin,t.damageMin);assert.equal(i.damageMax,t.damageMax);assert.equal(i.damageRate,g.damageRate);assert.equal(i.stats.ACC,t.ACC+g.ACC);assert.equal(i.stats.PEN,t.PEN+g.PEN);}else{assert.equal(i.stats.AR,t.AR+g.AR);assert.deepEqual(i.typeModifiers,t.typeModifiers);assert.equal(i.classId,undefined);assert.equal(i.stats.DEF,undefined);}}
 assert.equal(generate('greatsword').stats.ACC,-2);
});
test('weighted grade boundaries are exactly 60/25/10/4/1 independent of special roll',()=>{
 const counts=Object.fromEntries(c.grades.map(g=>[g.id,0]));for(let r=0;r<100;r++)counts[rollGrade(()=>r).id]++;assert.deepEqual(Object.values(counts),[60,25,10,4,1]);
 const calls=[];const i=generateEquipment({slot:'weapon',classId:'warrior',rng:n=>{calls.push(n);return n===100?99:0;}});assert.deepEqual(calls,[15,100,10000,5]);assert.equal(i.gradeId,'legendary');assert.ok(i.special);assert.equal(i.damageTypes.length,3);
});
test('weapon range is inclusive and damage is floored only once after all multipliers',()=>{
 const w=generate('dagger','fine');const rolls=Array.from({length:5},(_,r)=>rollWeaponDamage(w,()=>r));assert.deepEqual(rolls,[9,10,11,12,13]);
 const args={roll:12,acc:6,defense:3,str:3,base:9,pen:3,ar:3,damageRate:.15,damageTypes:['slash']};assert.equal(attack(args).damage,Math.floor(9*1.15*1.15));
});
test('lowest effective AR is used; an extra type never reduces damage',()=>{
 const a=generate('leather');assert.deepEqual(effectiveArmor(a.stats.AR,['slash','pierce'],a.typeModifiers),{damageType:'slash',effectiveAR:5});assert.deepEqual(effectiveArmor(5,['slash','pierce','blunt'],a.typeModifiers),{damageType:'blunt',effectiveAR:3});
 const args={roll:12,acc:6,defense:3,str:3,base:16,pen:3,ar:5,typeModifiers:a.typeModifiers};const d=attack({...args,damageTypes:['slash','pierce']}).damage;for(const type of Object.keys(c.damageTypes).filter(t=>t!=='raw'))assert.ok(attack({...args,damageTypes:['slash','pierce',type]}).damage>=d);
});
test('Raw is fixed on any non-miss, exclusive, unaffected by STR, grade, PEN, AR',()=>{
 for(const roll of [2,8,12,20]){const a=attack({roll,acc:6,defense:3,str:100,base:900,pen:-100,ar:900,damageTypes:['raw'],damageRate:99,fixedDamage:7});assert.equal(a.damage,a.tier===0?0:7);assert.equal(a.effectiveAR,0);assert.equal(a.pen,null);}
 assert.throws(()=>effectiveArmor(1,['slash','raw']));assert.throws(()=>attack({roll:12,acc:10,defense:0,damageTypes:['raw']}));
 const catalog=structuredClone(c);catalog.weapons.push({id:'raw-test',name:'Raw 검증',slot:'weapon',hitDefense:'WIL',ACC:0,damageTypes:['raw'],fixedDamage:7});validateCatalog(catalog);
 const raw=generateEquipment({slot:'weapon',classId:'wizard',templateId:'raw-test',gradeId:'legendary',rng:()=>0,catalog});assert.deepEqual(raw.damageTypes,['raw']);assert.equal(raw.fixedDamage,7);assert.equal(raw.stats.PEN,undefined);assert.equal(raw.damageRate,undefined);assert.equal(raw.special,null);
 catalog.weapons.at(-1).damageTypes.push('fire');assert.throws(()=>validateCatalog(catalog));
});
test('1% special boundaries, nonduplicated types, armor +1..+4, prefixes and suffixes',()=>{
 let count=0;for(let r=0;r<10000;r++)if(chance(()=>r,1))count++;assert.equal(count,100);
 for(const t of c.weapons){const i=generate(t.id,'normal',{specials:true});assert.equal(i.damageTypes.length,t.damageTypes.length+1);assert.equal(new Set(i.damageTypes).size,i.damageTypes.length);assert.ok(!i.damageTypes.includes('raw'));assert.ok(i.name.endsWith(t.name));assert.notEqual(i.name,t.name);}
 for(const t of c.armors)for(let v=0;v<4;v++){let call=0;const i=generate(t.id,'legendary',{specials:true,rng:()=>[0,0,v][call++]});assert.equal(Object.keys(i.typeModifiers).length,Object.keys(t.typeModifiers).length+1);assert.ok(Object.keys(i.typeModifiers).length<=3);assert.equal(i.special.amount,v+1);assert.equal(t.typeModifiers[i.special.type],undefined);assert.ok(!('raw' in i.typeModifiers));assert.ok(i.name.startsWith(t.name+' - '));}
 let n=0;const leather=generate('leather','legendary',{specials:true,rng:()=>[0,2,2][n++]});assert.equal(leather.name,'가죽 갑옷 - 소각저항');assert.equal(effectiveArmor(leather.stats.AR,['fire'],leather.typeModifiers).effectiveAR,12);assert.equal(effectiveArmor(leather.stats.AR,['blunt'],leather.typeModifiers).effectiveAR,7);
});
test('victory and boss equipment roll is exactly 25%, chests give no equipment, defeat gives none; boss idempotent',()=>{
 for(const kind of ['victory','boss']){let drops=0;const g=make();for(let roll=0;roll<10000;roll++){g.state.run++;g.rng=n=>n===10000?roll:0;const before=g.state.inventory.length;g.reward(kind);drops+=g.state.inventory.length-before;if(g.state.inventory.length>before)assert.ok(['weapon','armor','charm'].includes(g.state.inventory.at(-1).slot));}assert.equal(drops,2500);}
 const g=make();const before=g.state.inventory.length;g.reward('boss');const after=g.state.inventory.length;g.reward('boss');assert.equal(g.state.inventory.length,after);g.reward('treasure');assert.equal(g.state.inventory.length,after);assert.equal(g.state.lastReward.itemId,null);const n=g.state.inventory.length;g.phase('DOWNED',1);g.advance();assert.equal(g.state.inventory.length,n);assert.ok(after>=before);
});
test('loot is unrestricted, both classes wear armor, starter cannot roll free legendary',()=>{
 for(const cls of ['warrior','wizard']){const g=make(cls);assert.equal(g.state.inventory[0].gradeId,'normal');assert.equal(g.state.inventory[0].special,null);for(let j=0;j<30;j++){const i=g.item('weapon');assert.equal(i.classId,undefined);}const a=generate('plate','legendary');g.state.inventory.push(a);g.command({characterId: g.character?.id, type:'EQUIP',itemId:a.id});assert.equal(stats(g.state,config).AR,13);}
});
test('equipping new weapon and armor changes next attack, including type matchups',()=>{
 const g=make();const w=generate('mace','legendary'),a=generate('leather');g.state.inventory.push(w,a);g.beginBattle();g.state.enemy.hp=9999;g.state.enemy.AR=5;g.state.enemy.typeModifiers={blunt:-2};g.command({characterId: g.character?.id, type:'EQUIP',itemId:w.id});while(g.state.battle.actor!=='hero')g.battleAction();g.battleAction();assert.equal(g.state.battle.lastHit.damageType,'blunt');assert.equal(g.state.battle.lastHit.effectiveAR,3);assert.equal(g.state.battle.lastHit.pen,7);
 g.command({characterId: g.character?.id, type:'EQUIP',itemId:a.id});g.state.battle.actor='enemy';g.battleAction();assert.equal(g.state.battle.lastHit.effectiveAR,3);
});
test('current saved items survive reload/template changes; retired gear becomes new catalog gear and stays sellable',()=>{
 const g=make();const legacy={id:'old-sword',slot:'weapon',name:'여행자의 검',classId:'warrior',tier:2,rarity:'희귀',value:40,icon:'sword',stats:{power:6,PEN:5}};g.state.inventory.push(legacy);g.command({characterId: g.character?.id, type:'EQUIP',itemId:legacy.id});g.beginBattle();g.state.enemy.hp=9999;while(g.state.battle.actor!=='hero')g.battleAction();g.battleAction();assert.equal(g.state.battle.lastHit.base,22);assert.equal(g.state.battle.lastHit.pen,5);
 const special=generate('leather','legendary',{specials:true});g.state.inventory.push(special);const saved=JSON.parse(JSON.stringify(g.state));const restarted=new Game(config,saved);assert.deepEqual(restarted.state.inventory.filter(i=>i.id!==legacy.id),g.state.inventory.filter(i=>i.id!==legacy.id));assert.equal(restarted.state.inventory.find(i=>i.id===legacy.id).templateId,'longsword');restarted.command({characterId: restarted.character?.id, type:'UNEQUIP',itemId:legacy.id});restarted.command({characterId: restarted.character?.id, type:'SELL',itemId:legacy.id});assert.equal(restarted.state.gold,40);assert.deepEqual(restarted.state.inventory.find(i=>i.id===special.id),special);
 const altered=structuredClone(c);altered.armors[1].AR=99;assert.equal(special.stats.AR,9);
});
test('monster growth depends on level and route, never on equipped gear',()=>{
 const g=make();g.character.level=40;g.state.step=10;g.beginBattle(true);const before=structuredClone(g.state.enemy);const w=generate('longsword','legendary');g.state.inventory.push(w);g.command({characterId: g.character?.id, type:'EQUIP',itemId:w.id});g.beginBattle(true);assert.deepEqual(g.state.enemy,before);
});
test('UI shows integer damage, compact combat tags, armor modifiers and safe category images',()=>{
 assert.match(itemDetailsHTML(generate('greatsword')),/-2/);assert.doesNotMatch(itemDetailsHTML(generate('greatsword')),/\+-/);assert.doesNotMatch(itemDetailsHTML(generate('leather')),/\(방어도/);const dagger=generate('dagger','fine');assert.match(itemDetailsHTML(dagger),new RegExp(`<b>${Math.floor(dagger.damageMin*1.15)}–${Math.floor(dagger.damageMax*1.15)}</b>`));assert.match(itemDetailsHTML(dagger),/item-combat-tags/);assert.doesNotMatch(itemDetailsHTML(dagger),/명중 판정/);assert.match(itemIconHTML(generate('dagger')),/dagger-v1\.webp/);assert.doesNotMatch(itemIconHTML({...generate('dagger'),iconPath:'https://other.test/tracker'}),/<img/);
});

test('both classes receive each equipment slot from victory and bosses, with one shared drop roll',()=>{
 for(const cls of ['warrior','wizard'])for(const kind of ['victory','boss'])for(const [pick,slot] of ['weapon','armor','charm'].entries()){
  const g=make(cls),before=g.state.inventory.length,calls=[];
  g.rng=n=>{calls.push(n);return n===3?pick:0;};g.reward(kind);
  assert.equal(g.state.inventory.length,before+1);const item=g.state.inventory.at(-1);
  assert.equal(item.slot,slot);assert.equal(g.state.lastReward.itemId,item.id);assert.equal(calls[0],10000);assert.equal(calls[1],3);
  if(slot==='charm'){assert.equal(item.tier,0);assert.equal(item.primaryStat,'STR');assert.deepEqual(item.stats,{STR:1});g.command({characterId: g.character?.id, type:'EQUIP',itemId:item.id});assert.equal(g.character.equipment.charm,item.id);const restored=new Game(config,JSON.parse(JSON.stringify(g.state)));assert.deepEqual(restored.state.inventory.at(-1),item);}
  const noDrop=make(cls),count=noDrop.state.inventory.length;noDrop.rng=n=>{assert.equal(n,10000);return 2500;};noDrop.reward(kind);assert.equal(noDrop.state.inventory.length,count);assert.equal(noDrop.state.lastReward.itemId,null);
 }
});
