import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../src/game.js';
import { stats } from '../src/combat.js';
import { generateEquipment } from '../src/equipment.js';
import { generateMonster, eligibleVariations, MONSTER_CATALOG, ENCOUNTER_CONFIG, validateMonsters } from '../src/monsters.js';
const config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url)));
const make = () => { const game = new Game(config, null, () => 0); game.create({ name: '체력 검증', appearanceId: 'warrior' }); return game; };

test('HP uses base 50, growth 10 and five percent per CON with final flooring', () => {
  const game = make();
  assert.equal(game.character.hp, 50);
  for (const [level, con, expected] of [[1,0,50],[1,1,52],[1,2,55],[2,0,60],[2,1,63],[2,2,66],[6,3,115],[10,2,154],[40,5,550]]) {
    game.character.level = level; game.character.attributes.CON = con;
    assert.equal(stats(game.state, config).maxHp, expected, `Lv.${level} CON ${con}`);
    assert.equal(game.snapshot().characters[0].maxHp, expected);
  }
});
test('equipped CON joins invested CON; flat HP stays outside the percentage', () => {
  const game = make(); game.character.level = 2; game.character.attributes.CON = 1;
  const charm = generateEquipment({slot:'charm',templateId:'vitality-charm',gradeId:'normal',rng:()=>0});
  game.state.inventory.push(charm);
  game.command({type:'EQUIP',characterId:game.character.id,itemId:charm.id});
  assert.equal(stats(game.state, config).maxHp, 66);
  const armor = game.state.inventory.find(i => i.id === game.character.equipment.armor);
  armor.stats.HP = 7;
  assert.equal(stats(game.state, config).maxHp, 73);
});
test('growth and reload preserve current HP; CON removal clamps only and inn departure heals', () => {
  let game = make(); game.character.hp = 17;
  game.command({type:'ALLOCATE_STAT',characterId:game.character.id,stat:'CON'});
  assert.equal(game.character.hp, 17);
  game.character.level = 2;
  game = new Game(config, structuredClone(game.state), () => 0);
  assert.equal(game.character.hp, 17); assert.equal(stats(game.state, config).maxHp, 63);
  const charm = generateEquipment({slot:'charm',templateId:'vitality-charm',gradeId:'normal',rng:()=>0});
  game.state.inventory.push(charm); game.command({type:'EQUIP',characterId:game.character.id,itemId:charm.id});
  game.character.hp = 66;
  game.command({type:'UNEQUIP',characterId:game.character.id,itemId:charm.id});
  assert.equal(game.character.hp, 63);
  game.command({type:'EQUIP',characterId:game.character.id,itemId:charm.id});
  assert.equal(game.character.hp, 63);
  game.command({type:'DEPART',characterId:game.character.id});
  assert.equal(game.character.hp, 66);
});


test('every monster variant shares character HP for equal level and CON', () => {
  const game = make(); game.character.level = 2;
  const pool = eligibleVariations('village');
  for (let variant = 0; variant < pool.length; variant++) for (const [con, hp] of [[0,60],[1,63],[2,66]]) {
    let draw = 0, points = 0;
    const enemy = generateMonster('village', n => {
      if (++draw === 1) return variant;
      if (draw === 2) return 1; // Village minimum level 1 plus 1.
      if (draw === 3) return 0; // Normal grade.
      return points++ < con ? 1 : 0; // CON, then STR for all remaining points.
    });
    game.character.attributes.CON = con;
    assert.equal(enemy.level, 2); assert.equal(enemy.CON, con);
    assert.equal(enemy.hp, hp); assert.equal(enemy.maxHp, stats(game.state, config).maxHp);
    assert.equal(enemy.variationId, pool[variant].variation.id);
  }
  for (const invalid of [undefined, -1, NaN]) {
    const catalog = structuredClone(MONSTER_CATALOG); catalog[0].hpConPercent = invalid;
    assert.throws(() => validateMonsters(catalog, ENCOUNTER_CONFIG), /Invalid monster base/);
  }
});
test('boss HP uses generated CON and the shared formula without route or risk multipliers', () => {
  const game = make(); game.character.attributes.CON = 20;game.state.mapId='volcano';
  for (const level of [1,2,10,40]) for (const risk of [0,5]) {
    game.character.level = level; game.state.risk = risk; game.state.step = risk ? 10 : 0;
    game.rng = n => n === 6 ? 1 : 0;game.beginBattle(true);
    const enemy=game.state.enemy,hp=Math.floor((50+10*(level-1))*(100+5*enemy.CON)/100);
    assert.equal(enemy.level,level);assert.equal(enemy.CON,10+Math.floor(level/2));
    assert.equal(enemy.maxHp,hp);assert.equal(enemy.hp,hp);
  }
});
