// Offline balance experiment: no accounts, network or production database access.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Game } from '../src/game.js';
import { BASE_STATS, EQUIPMENT_CATALOG, generateEquipment } from '../src/equipment.js';
import { ENCOUNTER_CONFIG, generateMonster, recordMonsterEncounter } from '../src/monsters.js';
import { pointBudget } from '../src/characters.js';
import { stats } from '../src/combat.js';
import { COMBAT_RULES_VERSION } from '../src/action-speed.js';
import { simulateBattle } from './combat-simulation.js';

const config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url)));
export const BUILDS = [
  { id: 'melee', name: '롱소드 + 가죽갑옷', weapon: 'longsword', armor: 'leather' },
  { id: 'staff', name: '화염 지팡이 + 로브', weapon: 'fire-staff', armor: 'robe' }
];
export const DEFAULT_LEVELS = [1, 5, 10, 20, 40];
export const DEFAULT_OFFSETS = [0, 1, 3, 5, 10];
export function seededRng(seed) {
  let state = seed | 0;
  return n => {
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return Math.floor(((t ^ (t >>> 14)) >>> 0) / 4294967296 * n);
  };
}
export function balancedAttributes(level) {
  assert.ok(Number.isSafeInteger(level) && level > 0, 'Character level must be a positive integer');
  const points = pointBudget(level);
  // The remainder follows the game's stat order; increases never remove allocated points.
  return Object.fromEntries(BASE_STATS.map((key, i) => [key, Math.floor(points / BASE_STATS.length) + (i < points % BASE_STATS.length ? 1 : 0)]));
}
export function scenarioMonster(level, gradeId, seed) {
  assert.ok(Number.isSafeInteger(level) && level > 0, 'Monster level must be a positive integer');
  const grades = EQUIPMENT_CATALOG.grades, index = grades.findIndex(g => g.id === gradeId);
  assert.ok(index >= 0, 'Unknown monster grade');
  const gradeRoll = grades.slice(0, index).reduce((sum, g) => sum + g.weight, 0);
  const gradeTotal = grades.reduce((sum, g) => sum + g.weight, 0);
  const rules = structuredClone(ENCOUNTER_CONFIG);
  rules.regions.village.minLevel = rules.regions.village.maxLevel = level;
  const rng = seededRng(seed);
  let draw = 0;
  // generateMonster draws variation, level, then grade. Only the grade draw is fixed;
  // consume its random value too so each grade receives the same attributes and variant.
  // Keep this adapter in the simulation, leaving live spawning and its probabilities intact.
  const enemy = generateMonster('village', n => {
    const value = rng(n);
    if (++draw === 3) { assert.equal(n, gradeTotal, 'Monster generator draw order changed'); return gradeRoll; }
    return value;
  }, undefined, rules, config);
  assert.equal(enemy.level, level);
  assert.equal(enemy.gradeId, gradeId);
  assert.equal(enemy.boss, false);
  return enemy;
}
export function prepareCharacter(buildId, level) {
  const build = BUILDS.find(b => b.id === buildId);
  assert.ok(build, 'Unknown character build');
  const game = new Game(config, null, seededRng(0));
  game.create({ name: '성장 비교', appearanceId: 'warrior' });
  game.character.level = level;
  game.character.attributes = balancedAttributes(level);
  const gear = ['weapon', 'armor'].map(slot => generateEquipment({ slot, templateId: build[slot], gradeId: 'normal', specials: false, rng: seededRng(0) }));
  game.state.inventory = gear;
  game.character.equipment = Object.fromEntries(gear.map(item => [item.slot, item.id]));
  game.character.hp = stats(game.state, config).maxHp;
  game.state.homePaused = false;
  return game;
}
export function startScenarioBattle(game, enemyLevel, gradeId, seed) {
  // Use the actual battle initializer, then replace its unstarted random opponent.
  game.beginBattle(false);
  game.state.enemy = scenarioMonster(enemyLevel, gradeId, seed);
  game.state.bestiary = {};
  recordMonsterEncounter(game.state, game.state.enemy);
  game.refreshBattleTiming();
  game.events = [];
  game.rng = seededRng(seed ^ 0x51F15EED);
  return game;
}
export function confidence95(wins, samples) {
  const z = 1.959963984540054, p = wins / samples, denominator = 1 + z * z / samples;
  const center = (p + z * z / (2 * samples)) / denominator;
  const margin = z * Math.sqrt(p * (1 - p) / samples + z * z / (4 * samples * samples)) / denominator;
  return [Math.max(0, center - margin) * 100, Math.min(1, center + margin) * 100];
}
export function runGrowth({ levels = DEFAULT_LEVELS, offsets = DEFAULT_OFFSETS, samples = 200, onProgress = () => {} } = {}) {
  assert.ok(Number.isSafeInteger(samples) && samples > 0, 'Samples must be a positive integer');
  assert.ok(levels.length && levels.every(n => Number.isSafeInteger(n) && n > 0), 'Invalid character levels');
  assert.ok(offsets.length && offsets.every(n => Number.isSafeInteger(n) && n >= 0), 'Invalid enemy level offsets');
  const rows = [], characters = [];
  for (const build of BUILDS) for (const level of levels) {
    const game = prepareCharacter(build.id, level), initialState = structuredClone(game.state);
    characters.push({ build: build.id, level, attributes: { ...game.character.attributes }, stats: stats(game.state, config) });
    for (const offset of offsets) for (const grade of EQUIPMENT_CATALOG.grades) {
      let wins = 0, losses = 0, timeouts = 0, timeMs = 0;
      const monsters = {}, variations = {};
      for (let seed = 1; seed <= samples; seed++) {
        // Each trial starts at full HP with no accumulated rewards, cooldowns or level-ups.
        game.state = structuredClone(initialState);
        game.rng = seededRng(0);
        startScenarioBattle(game, level + offset, grade.id, seed);
        const enemy = game.state.enemy;
        const bucket = monsters[enemy.monsterId] ||= { samples: 0, wins: 0, losses: 0, timeouts: 0 };
        bucket.samples++;
        variations[enemy.variationId] = (variations[enemy.variationId] || 0) + 1;
        const result = simulateBattle(game, 600000);
        timeMs += result.battleTimeMs;
        if (result.capped) { timeouts++; bucket.timeouts++; }
        else if (result.won) { wins++; bucket.wins++; }
        else { assert.equal(game.state.phase, 'DOWNED'); losses++; bucket.losses++; }
      }
      rows.push({ build: build.id, characterLevel: level, enemyLevel: level + offset, levelOffset: offset,
        enemyGrade: grade.id, samples, wins, losses, timeouts, winPercent: 100 * wins / samples,
        win95Percent: confidence95(wins, samples), timeoutPercent: 100 * timeouts / samples,
        meanTimeMs: timeMs / samples, monsters, variations });
    }
    onProgress({ build: build.id, level, battles: rows.reduce((sum, row) => sum + row.samples, 0) });
  }
  return { rulesVersion: COMBAT_RULES_VERSION, samplesPerCell: samples, totalBattles: rows.reduce((sum, row) => sum + row.samples, 0),
    levels, offsets, grades: EQUIPMENT_CATALOG.grades.map(({ id, name }) => ({ id, name })), builds: BUILDS,
    assumptions: { attributes: 'All points evenly allocated; remainder order: ' + BASE_STATS.join(', '),
      equipment: 'Normal weapon and armor; no accessories or special options', skills: 'Basic attacks only',
      enemies: 'All normal monster variants, uniformly sampled; level and grade fixed per cell; attributes randomly allocated by live generator',
      levelRange: 'Controlled experiment; regional spawn level limits are overridden only in simulation',
      trials: 'Full HP per battle, independent state; matched seeds across builds/grades/levels; no travel or encounter trigger roll',
      timeout: '600 seconds of game time; reported separately; wins divided by all samples', confidence: '95% Wilson interval; Monte Carlo estimate' },
    characters, rows };
}
export function markdownReport(report) {
  const lines = ['# 캐릭터 성장별 일반 몬스터 승률', '',
    `조건당 ${report.samplesPerCell}전, 총 ${report.totalBattles.toLocaleString('en-US')}전. 표의 값은 승률(%).`, '',
    '- 능력치: 전 포인트 균등 배분. 나머지는 STR → CON → DEX → PER → INT → RES 순서.',
    '- 일반 무기·방어구, 장신구·특수 옵션 없음. 기본 공격만 사용하고 매 전투 최대 HP로 시작.',
    '- 일반 몬스터 28변종 무작위 선택. 각 열의 등급과 행의 레벨을 고정하고 몬스터 능력치는 실제 생성 규칙으로 배분.',
    '- 지역별 출현 레벨 제한을 넘는 조건도 포함한 가상 비교이며, 실제 출현 빈도로 등급을 섞지 않음.',
    '- 승률은 전체 시행 대비 승리 비율. 10분 시간 초과는 패배와 별도 집계. JSON/CSV에 표본 수·95% 신뢰구간 포함.', ''];
  for (const build of report.builds) {
    lines.push(`## ${build.name}`, '', '| 캐릭터 Lv | 몬스터 Lv | 차이 | ' + report.grades.map(g => g.name).join(' | ') + ' |',
      '| --- | --- | --- | ' + report.grades.map(() => '---:').join(' | ') + ' |');
    for (const level of report.levels) for (const offset of report.offsets) {
      const values = report.grades.map(g => report.rows.find(r => r.build === build.id && r.characterLevel === level && r.levelOffset === offset && r.enemyGrade === g.id).winPercent.toFixed(1));
      lines.push(`| ${level} | ${level + offset} | ${offset ? '+' + offset : '동레벨'} | ${values.join(' | ')} |`);
    }
    lines.push('');
  }
  const timeouts = report.rows.reduce((n, r) => n + r.timeouts, 0);
  lines.push(`총 시간 초과: ${timeouts}전.`, '');
  return lines.join('\n');
}
export function csvReport(report) {
  const header = ['build', 'characterLevel', 'enemyLevel', 'levelOffset', 'enemyGrade', 'samples', 'wins', 'losses', 'timeouts', 'winPercent', 'ci95Low', 'ci95High', 'meanTimeMs'];
  return [header.join(','), ...report.rows.map(r => [r.build, r.characterLevel, r.enemyLevel, r.levelOffset, r.enemyGrade,
    r.samples, r.wins, r.losses, r.timeouts, r.winPercent, ...r.win95Percent, r.meanTimeMs].join(','))].join('\n') + '\n';
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const output = resolve(process.argv[2] || '/tmp/zwiequest-growth'), samples = Number(process.argv[3] || 200);
  const report = runGrowth({ samples, onProgress: p => console.log(`${p.build} Lv.${p.level}: ${p.battles} battles complete`) });
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output + '.json', JSON.stringify(report, null, 2) + '\n');
  writeFileSync(output + '.csv', csvReport(report));
  writeFileSync(output + '.md', markdownReport(report));
  console.log(`Saved ${output}.{json,csv,md}`);
}
