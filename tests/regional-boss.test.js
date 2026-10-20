import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../src/game.js';
import { generateBoss, eligibleBossVariations, validateMonsters, MONSTER_CATALOG, ENCOUNTER_CONFIG } from '../src/monsters.js';
import { EQUIPMENT_CATALOG } from '../src/equipment.js';
import { pointBudget } from '../src/characters.js';
const config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url)));
const regions = {volcano:'fire',snow:'cold',desert:'corrosion',beach:'lightning'};

test('all regional bosses match the region element, character level and legendary gear', () => {
  const legendary=EQUIPMENT_CATALOG.grades.find(g=>g.id==='legendary');
  for(const [mapId,type] of Object.entries(regions)) {
    const pool=eligibleBossVariations(mapId),seen=new Set();
    assert.equal(pool.length,4);
    for(let pick=0;pick<pool.length;pick++)for(const level of [1,7,20,40]) {
      let draw=0;const e=generateBoss(mapId,level,n=>draw++===0?pick:1,undefined,undefined,config);
      seen.add(e.monsterId);
      assert.equal(e.boss,true);assert.equal(e.level,level);assert.equal(e.gradeId,'legendary');
      assert.equal(e.variationId,pool[pick].variation.id);assert.deepEqual(e.damageTypes,[type]);
      assert.equal(e.weapon.gradeId,'legendary');assert.equal(e.armor.gradeId,'legendary');
      assert.equal(e.weapon.damageRate,legendary.damageRate);assert.equal(e.AR,3+legendary.AR);
      assert.equal(e.weapon.special,null);assert.equal(e.armor.special,null);
      assert.equal(Object.values(e.allocatedAttributes).reduce((a,b)=>a+b,0),pointBudget(level));
      assert.equal(e.maxHp,Math.floor((50+10*(level-1))*(100+5*e.CON)/100));
      assert.equal(e.hp,e.maxHp);assert.ok(e.img_path);assert.ok(e.icon_path);
    }
    assert.deepEqual([...seen].sort(),['ghost','golem','harpy','slime']);
  }
});
test('boss validation rejects missing or impossible regional elements and invalid levels', () => {
  assert.throws(()=>generateBoss('village',1,()=>0),/No regional boss/);
  assert.throws(()=>generateBoss('volcano',0,()=>0),/Invalid boss level/);
  for(const type of [undefined,'unknown','raw','cold']) {
    const rules=structuredClone(ENCOUNTER_CONFIG);rules.regions.volcano.bossDamageType=type;
    assert.throws(()=>validateMonsters(MONSTER_CATALOG,rules),/Invalid regional boss/);
  }
});
test('battle snapshots preserve the selected boss and award boss rewards and bestiary defeat exactly once', () => {
  const g=new Game(config,null,()=>0);g.create({name:'보스 확인',appearanceId:'warrior'});
  g.character.level=7;g.state.mapId='volcano';g.state.currentNodeId=g.state.maps.volcano.rootId;
  g.state.risk=0;g.beginBattle(true);
  const enemy=structuredClone(g.state.enemy),id=enemy.variationId;
  assert.equal(g.state.bestiary[id].encounters,1);assert.equal(g.state.bestiary[id].grades.legendary,1);
  g.character.level=8;
  const restored=new Game(config,structuredClone(g.state),()=>{throw Error('reload must not reroll');});
  assert.deepEqual(restored.state.enemy,enemy);assert.equal(restored.state.enemy.level,7);
  assert.equal(restored.state.bestiary[id].encounters,1);
  restored.rng=n=>n-1;restored.state.enemy.hp=1;restored.state.enemy.DEF=-100;restored.state.enemy.REF=-100;restored.state.enemy.AR=0;
  restored.battleAction('hero');
  assert.equal(restored.state.phase,'TREASURE');assert.equal(restored.state.bossDefeats,1);
  assert.equal(restored.state.lastReward.kind,'boss');assert.equal(restored.state.lastReward.xp,config.balance.bossXP);
  assert.equal(restored.state.bestiary[id].defeats,1);
  const saved=structuredClone(restored.state);restored.reward('boss');assert.deepEqual(restored.state,saved);
  restored.advance();assert.equal(restored.state.phase,'RETURN_HOME');
  restored.advance();assert.equal(restored.state.phase,'HOME');
});
