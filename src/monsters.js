import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { BASE_STATS, EQUIPMENT_CATALOG, generateEquipment, rollGrade, validateCatalog } from './equipment.js';
import { pointBudget } from './characters.js';
import { statDetails, levelCombatBonus } from './combat.js';
import { REGIONS } from './regions.js';

const root = new URL('../', import.meta.url);
// Keep the runtime rules shape for callers; all region data comes from regions.json.
export const ENCOUNTER_CONFIG = { ...JSON.parse(readFileSync(new URL('data-templates/encounters.json', root))), regions: REGIONS };
const folder = new URL('data-templates/monster/', root);
export const MONSTER_CATALOG = readdirSync(folder).filter(name => name.endsWith('.json')).sort().flatMap(name =>
  Object.entries(JSON.parse(readFileSync(new URL(name, folder)))).map(([id, definition]) => ({ id, ...definition })));
const safePath = path => typeof path === 'string' && /^public\/assets\/monster\/[a-z0-9/_-]+\.webp$/.test(path);
export function eligibleVariations(mapId, catalog = MONSTER_CATALOG, rules = ENCOUNTER_CONFIG) {
  const region = rules.regions[mapId];
  if (!region) throw Error(`Unknown monster region: ${mapId}`);
  return catalog.filter(monster => !monster.regions || monster.regions.includes(mapId)).flatMap(monster => monster.variation
    .filter(variation => (!region.allowedDamageTypes || variation.weapon.damageTypes.some(type => region.allowedDamageTypes.includes(type)))
      && !variation.weapon.damageTypes.some(type => region.excludedDamageTypes?.includes(type)))
    .map(variation => ({ monster, variation })));
}
export function eligibleBossVariations(mapId, catalog = MONSTER_CATALOG, rules = ENCOUNTER_CONFIG) {
  const type = rules.regions[mapId]?.bossDamageType;
  if (!type) throw Error(`No regional boss configured for ${mapId}`);
  const monsterId = rules.regions[mapId].bossMonsterId;
  return eligibleVariations(mapId, catalog, rules).filter(({ monster, variation }) => (!monsterId || monster.id === monsterId) && variation.weapon.damageTypes.includes(type));
}
export function validateMonsters(catalog, rules) {
  const typeOrders = new Set(), ids = new Set(), types = new Set(Object.keys(EQUIPMENT_CATALOG.damageTypes));
  if (!catalog.length || rules.version !== 1) throw Error('Missing monster templates or unsupported encounter version');
  for (const monster of catalog) {
    if (!Number.isSafeInteger(monster.codexOrder) || monster.codexOrder <= 0) throw Error(`Invalid monster codexOrder: ${monster.id}`);
    if (typeOrders.has(monster.codexOrder)) throw Error(`duplicate monster codexOrder: ${monster.codexOrder}`);
    typeOrders.add(monster.codexOrder);
    if (monster.regions !== undefined && (!Array.isArray(monster.regions) || !monster.regions.length || new Set(monster.regions).size !== monster.regions.length || monster.regions.some(id => !Object.hasOwn(rules.regions, id)))) throw Error(`Invalid monster regions: ${monster.id}`);
    const variationOrders = new Set();
    if (!/^[a-z0-9_-]+$/.test(monster.id) || !Number.isInteger(monster.hp) || monster.hp < 1 || !Number.isInteger(monster.hpGrowth) || monster.hpGrowth < 0 || !Number.isFinite(monster.hpConPercent) || monster.hpConPercent < 0 || typeof monster.description !== 'string') throw Error('Invalid monster base');
    for (const key of BASE_STATS) if (!Number.isInteger(monster.A?.[key]) || monster.A[key] < 0) throw Error('Invalid monster attribute');
    for (const key of ['ACC','DEF','REF','FOR','WIL']) if (!Number.isInteger(monster.B?.[key])) throw Error('Invalid monster defense');
    if (!Array.isArray(monster.variation) || !monster.variation.length) throw Error('Missing monster variations');
    for (const variation of monster.variation) {
      if (!Number.isSafeInteger(variation.codexOrder) || variation.codexOrder <= 0) throw Error(`Invalid variation codexOrder: ${monster.id}/${variation.id}`);
      if (variationOrders.has(variation.codexOrder)) throw Error(`duplicate variation codexOrder: ${monster.id}/${variation.codexOrder}`);
      variationOrders.add(variation.codexOrder);
      if (!/^[a-z0-9_-]+$/.test(variation.id) || ids.has(variation.id) || !variation.name || !Array.isArray(variation.skills)) throw Error('Invalid or duplicate variation');
      ids.add(variation.id);
      for (const path of [variation.img_path, variation.icon_path]) if (!safePath(path) || !existsSync(new URL(path, root))) throw Error(`Missing monster image: ${path}`);
      // Monster template IDs may use underscores; equipment validation otherwise stays shared.
      validateCatalog({ ...EQUIPMENT_CATALOG, weapons: [{ weaponCategory: 'natural', ...variation.weapon, id: 'monster-weapon' }], armors: [{ ...variation.armor, id: 'monster-armor' }] });
    }
  }
  for (const id of Object.keys(rules.regions)) {
    const region = rules.regions[id];
    if (!region || !Number.isInteger(region.minLevel) || !Number.isInteger(region.maxLevel) || region.minLevel < 1 || region.maxLevel < region.minLevel || (region.excludedDamageTypes !== undefined && (!Array.isArray(region.excludedDamageTypes) || new Set(region.excludedDamageTypes).size !== region.excludedDamageTypes.length || region.excludedDamageTypes.some(type => !types.has(type)))) || (region.allowedDamageTypes !== undefined && (!Array.isArray(region.allowedDamageTypes) || !region.allowedDamageTypes.length || new Set(region.allowedDamageTypes).size !== region.allowedDamageTypes.length || region.allowedDamageTypes.some(type => !types.has(type))))) throw Error(`Invalid monster region: ${id}`);
    if (!eligibleVariations(id, catalog, rules).length) throw Error(`No eligible monsters for ${id}`);
    if (region.boss && (!types.has(region.bossDamageType) || !eligibleBossVariations(id, catalog, rules).length)) throw Error(`Invalid regional boss: ${id}`);
  }
  const r = rules.rewards;
  if (!r || !Number.isInteger(r.equalLevelKills) || r.equalLevelKills < 1 || !Number.isFinite(r.xpBonusPerLevel) || r.xpBonusPerLevel < 0 || !Number.isInteger(r.maxBonusLevels) || r.maxBonusLevels < 0 || !Number.isFinite(r.goldBase) || r.goldBase < 0 || !Number.isFinite(r.goldPerLevel) || r.goldPerLevel < 0 || EQUIPMENT_CATALOG.grades.some(g => !Number.isFinite(r.goldMultipliers?.[g.id]) || r.goldMultipliers[g.id] <= 0)) throw Error('Invalid monster rewards');
  return catalog;
}
validateMonsters(MONSTER_CATALOG, ENCOUNTER_CONFIG);

export function generateMonster(mapId, rng, catalog = MONSTER_CATALOG, rules = ENCOUNTER_CONFIG, config = {}) {
  const candidates = eligibleVariations(mapId, catalog, rules);
  if (!candidates.length) throw Error(`No eligible monsters for ${mapId}`);
  const { monster, variation } = candidates[rng(candidates.length)], region = rules.regions[mapId];
  const level = region.minLevel + rng(region.maxLevel - region.minLevel + 1), grade = rollGrade(rng);
  return buildMonster({ monster, variation }, level, grade, rng, mapId, config);
}
export function generateBoss(mapId, level, rng, catalog = MONSTER_CATALOG, rules = ENCOUNTER_CONFIG, config = {}) {
  if (!Number.isSafeInteger(level) || level < 1) throw Error('Invalid boss level');
  const candidates = eligibleBossVariations(mapId, catalog, rules);
  if (!candidates.length) throw Error(`No eligible bosses for ${mapId}`);
  const selected = candidates[rng(candidates.length)];
  const grade = EQUIPMENT_CATALOG.grades.find(g => g.id === 'legendary');
  return { ...buildMonster(selected, level, grade, rng, mapId, config), boss: true };
}
function buildMonster({ monster, variation }, level, grade, rng, mapId, config) {
  const allocatedAttributes = Object.fromEntries(BASE_STATS.map(key => [key, 0]));
  for (let i = 0; i < pointBudget(level); i++) allocatedAttributes[BASE_STATS[rng(BASE_STATS.length)]]++;
  const attributes = Object.fromEntries(BASE_STATS.map(key => [key, monster.A[key] + allocatedAttributes[key]]));
  const equipmentCatalog = { ...EQUIPMENT_CATALOG, weapons: [{ weaponCategory: 'natural', ...variation.weapon }], armors: [variation.armor] };
  const weapon = generateEquipment({ slot: 'weapon', templateId: variation.weapon.id, gradeId: grade.id, specials: false, rng, catalog: equipmentCatalog });
  const armor = generateEquipment({ slot: 'armor', templateId: variation.armor.id, gradeId: grade.id, specials: false, rng, catalog: equipmentCatalog });
  delete weapon.iconPath; delete armor.iconPath;
  const profile = { level, attributes, equipment: { weapon: weapon.id, armor: armor.id } };
  const { values } = statDetails({ inventory: [weapon, armor] }, { ...config, character: monster }, profile);
  return { ...values, id: randomUUID(), generationVersion: 1, boss: false, monsterId: monster.id, variationId: variation.id,
    name: grade.id === 'normal' ? variation.name : `${grade.name} ${variation.name}`, variationName: variation.name,
    description: monster.description, img_path: variation.img_path, icon_path: variation.icon_path,
    level, levelBonusApplied: levelCombatBonus(level), gradeId: grade.id, gradeName: grade.name, attributes, allocatedAttributes,
    hp: values.maxHp, weapon, armor, damageTypes: [...weapon.damageTypes], hitDefense: weapon.hitDefense,
    statusHpBase: monster.hp + monster.hpGrowth * (level - 1),
    skills: variation.skills.length ? structuredClone(variation.skills) : ({ slime: ['weakening-strike'], golem: ['constitution-inspiration'], harpy: ['binding-strike'], ghost: ['mind-fog'] }[monster.id] || []), ...(variation.attackName ? { attackName: variation.attackName } : {}), mapId };
}
export function monsterRewards(enemy, characterLevel, xpPerLevel, rules = ENCOUNTER_CONFIG) {
  const r = rules.rewards, difference = enemy.level - characterLevel, eligible = difference >= 0;
  return {
    xp: eligible ? Math.floor(characterLevel * xpPerLevel / r.equalLevelKills * (1 + r.xpBonusPerLevel * Math.min(difference, r.maxBonusLevels))) : 1,
    gold: Math.floor((r.goldBase + r.goldPerLevel * enemy.level) * r.goldMultipliers[enemy.gradeId]),
    canDrop: true
  };
}
export function recordMonsterEncounter(state, enemy) {
  if (enemy?.generationVersion !== 1) return;
  state.bestiary ||= {};
  const previous = state.bestiary[enemy.variationId];
  if (previous?.lastEncounterId === enemy.id) return;
  const now = Date.now();
  const entry = previous || { variationId: enemy.variationId, name: enemy.variationName, encounters: 0, defeats: 0,
    firstSeen: now, minLevel: enemy.level, maxLevel: enemy.level, grades: {}, maps: [] };
  entry.encounters++; entry.lastSeen = now; entry.lastEncounterId = enemy.id;
  entry.minLevel = Math.min(entry.minLevel, enemy.level); entry.maxLevel = Math.max(entry.maxLevel, enemy.level);
  entry.grades[enemy.gradeId] = (entry.grades[enemy.gradeId] || 0) + 1;
  if (!entry.maps.includes(enemy.mapId)) entry.maps.push(enemy.mapId);
  entry.sample = structuredClone(enemy); // Keep the encountered specimen, not unencountered catalog entries.
  state.bestiary[enemy.variationId] = entry;
}

// Resolve display order from current templates, never from historical encounter samples.
// Sorting a fresh entry array keeps saved discovery order and RNG candidate order intact.
export function sortedBestiaryEntries(bestiary = {}, catalog = MONSTER_CATALOG) {
  const orders = new Map(catalog.flatMap(monster => monster.variation.map(variation =>
    [variation.id, [monster.codexOrder, variation.codexOrder]])));
  return Object.entries(bestiary).sort(([a], [b]) => {
    const left = orders.get(a) || [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER];
    const right = orders.get(b) || [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER];
    return left[0] - right[0] || left[1] - right[1] || (a < b ? -1 : a > b ? 1 : 0);
  });
}

// Saved specimens store derived stats; adjust only the newly introduced level term.
export function migrateMonsterLevelBonuses(state) {
  for (const enemy of [state.enemy, ...Object.values(state.bestiary || {}).map(entry => entry.sample)]) {
    if (!enemy || !Number.isSafeInteger(enemy.level) || enemy.level < 1) continue;
    const bonus = levelCombatBonus(enemy.level), previous = enemy.levelBonusApplied || 0;
    for (const key of ['ACC','DEF','REF','FOR','WIL']) enemy[key] = (enemy[key] || 0) + bonus - previous;
    enemy.levelBonusApplied = bonus;
  }
}
