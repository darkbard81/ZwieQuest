import { activeCharacter } from './characters.js';
import { actionSpeed } from './action-speed.js';
import { modifiers } from './status-effects.js';
import { maintainedSkillBonuses } from './skills.js';
import { BASE_STATS } from './equipment.js';
const DEFENSE_RULES = {
  DEF: { attributes: { RES: 1 } },
  REF: { attributes: { DEX: 2, PER: 2 } },
  FOR: { attributes: { STR: 2, CON: 2 } },
  WIL: { attributes: { INT: 2, RES: 2 } }
};
export function hitResult(roll, acc, defense) {
  const margin = roll + acc - (10 + defense);
  let tier = margin >= 10 ? 3 : margin >= 0 ? 2 : margin >= -5 ? 1 : 0;
  tier = Math.max(0, Math.min(3, tier + (roll === 20 ? 1 : roll === 1 ? -1 : 0)));
  return { roll, margin, tier, label: ['빗나감', '스침', '명중', '치명타'][tier], multiplier: [0, .5, 1, 1.5][tier] };
}
export function penetration(pen, ar) {
  const p = pen - ar;
  return p >= 3 ? 1.25 : p >= 0 ? 1 : p === -1 ? .75 : .5;
}
export function effectiveArmor(ar, damageTypes = ['blunt'], typeModifiers = {}) {
  if (damageTypes.includes('raw')) {
    if (damageTypes.length !== 1) throw Error('Raw must be the only damage type');
    return { damageType: 'raw', effectiveAR: 0 };
  }
  if (!damageTypes.length) throw Error('At least one damage type is required');
  const damageType = damageTypes.reduce((best, type) => (typeModifiers[type] || 0) < (typeModifiers[best] || 0) ? type : best);
  return { damageType, effectiveAR: ar + (typeModifiers[damageType] || 0) };
}
export function attack({ roll, acc, defense, str, base, pen, ar, damageTypes = ['blunt'], typeModifiers = {}, damageRate = 0, tacticDamageRate = 0, fixedDamage, transformHit, skillDamageMultiplier = 1, masteryDamageRate = 0 }) {
  const initial = hitResult(roll, acc, defense), hit = transformHit ? transformHit(initial) : initial;
  const armor = effectiveArmor(ar, damageTypes, typeModifiers);
  const raw = armor.damageType === 'raw';
  if (raw && (!Number.isInteger(fixedDamage) || fixedDamage < 0)) throw Error('Raw requires nonnegative fixed damage');
  const factors = raw ? null : { grade: 1 + damageRate, tactic: 1 + tacticDamageRate, strength: Math.max(0, 1 + .05 * str), hit: hit.multiplier, armor: penetration(pen, armor.effectiveAR) };
  if (factors && masteryDamageRate) factors.mastery = Math.max(0, 1 + masteryDamageRate);
  const damage = raw ? (hit.tier === 0 ? 0 : fixedDamage) : Math.floor(base * (factors.mastery ?? 1) * skillDamageMultiplier * factors.grade * factors.tactic * factors.strength * factors.hit * factors.armor);
  return { ...hit, ...armor, damage, base, damageRate, tacticDamageRate, pen: raw ? null : pen, ar,
    calculation: { acc, defense, factors, ...(skillDamageMultiplier !== 1 ? { skillDamageMultiplier } : {}), fixedDamage: raw ? fixedDamage : null } };
}
// Shared character and monster HP; multiply before dividing to avoid rounding
// exact integer percentages down (e.g. 100 * 115 / 100 must be 115).
export function maximumHp(level, con, profile, equipmentHp = 0) {
  const baseHp = profile.hp + profile.hpGrowth * (level - 1);
  return Math.floor(baseHp * (100 + (profile.hpConPercent ?? 5) * con) / 100) + equipmentHp;
}
export const levelCombatBonus = level => 3 * Math.floor(Math.max(1, Number(level) || 1) / 2);
export function stats(state, config) {
  return statDetails(state, config).values;
}
// Values and their displayed breakdown share the same authoritative calculation.
export function statDetails(state, config, character = activeCharacter(state)) {
  const cls = config.character;
  if (!character) return { values: { ...Object.fromEntries([...BASE_STATS, 'ACC', 'DEF', 'REF', 'FOR', 'WIL', 'PEN', 'AR', 'power'].map(k => [k, 0])), maxHp: 0, ...actionSpeed(0, 0, config), typeModifiers: {} }, defenses: {}, attributes: {} };
  const gear = Object.values(character.equipment).map(id => state.inventory.find(i => i.id === id)).filter(Boolean);
  const e = key => gear.reduce((sum, i) => sum + (key === 'DEX' && i.slot === 'armor' ? 0 : i.stats[key] || 0), 0);
  const m = state.phase === 'BATTLE' && character.id === state.activeCharacterId ? modifiers(state.battle, 'hero') : {};
  const b = Object.fromEntries(BASE_STATS.map(key => [key, character.attributes[key] + e(key) + (m[key] || 0)]));
  const levelBonus = levelCombatBonus(character.level);
  const defenses = Object.fromEntries(Object.entries(DEFENSE_RULES).map(([key, rule]) => {
    const attributes = Object.entries(rule.attributes).map(([key, multiplier]) => ({ key, base: character.attributes[key], equipment: e(key), status: m[key] || 0, value: b[key], multiplier, contribution: b[key] * multiplier }));
    const detail = { base: cls.B[key], attributes, level: character.level, levelBonus, equipment: e(key), status: m[key] || 0, mastery: null };
    detail.total = detail.base + levelBonus + attributes.reduce((sum, a) => sum + a.contribution, 0) + detail.equipment + detail.status;
    return [key, detail];
  }));
  const values = {
    ...b,
    ACC: cls.B.ACC + levelBonus + b.PER + e('ACC') + (m.ACC || 0),
    ...Object.fromEntries(Object.entries(defenses).map(([key, detail]) => [key, detail.total])),
    maxHp: Math.max(1, maximumHp(character.level, b.CON, cls, e('HP'))),
    PEN: e('PEN') + (m.PEN || 0), AR: e('AR') + (m.AR || 0), power: e('power'),
    ...actionSpeed(b.DEX, gear.find(i => i.slot === 'armor')?.actionSpeedPenaltyRate || 0, config, gear.find(i => i.slot === 'weapon')?.actionSpeedPenaltyRate || 0),
    typeModifiers: { ...(gear.find(i => i.slot === 'armor')?.typeModifiers || {}) }
  };
  const mastery=character.id===state.activeCharacterId?maintainedSkillBonuses(state):{};
  const speedRate=Math.max(.1,1+(mastery.actionSpeedRate||0));
  values.actionSpeed*=speedRate; values.actionIntervalMs/=speedRate;
  values.actionIntervalMs *= m.actionTimeMultiplier || 1; values.actionSpeed /= m.actionTimeMultiplier || 1;
  const attributes = Object.fromEntries(BASE_STATS.map(key => [key, {
    base: character.attributes[key], equipment: e(key), status: m[key] || 0, total: b[key]
  }]));
  return { values, defenses, attributes };
}

// Normal-hit damage before target armor, critical/graze, or individual skill bonuses.
// Use the attack calculation itself so the displayed endpoints round identically.
export function basicAttackRange(state, config, hero = stats(state, config)) {
  const character = activeCharacter(state);
  if (!character) return { min: 0, max: 0 };
  const weapon = state.inventory.find(i => i.id === character.equipment.weapon);
  const modern = Array.isArray(weapon?.damageTypes), raw = modern && weapon.damageTypes.includes('raw');
  const legacy = weapon ? (weapon.icon === 'staff' ? config.balance.legacyStaffBasic : config.balance.legacySwordBasic) + hero.power : 1;
  const min = modern ? (raw ? weapon.fixedDamage : weapon.damageMin) : legacy;
  const max = modern ? (raw ? weapon.fixedDamage : weapon.damageMax) : legacy;
  const damage = base => attack({ roll: 10, acc: 10, defense: 10, str: hero.STR, base, pen: 0, ar: 0,
    damageTypes: modern ? weapon.damageTypes : ['blunt'], fixedDamage: raw ? weapon.fixedDamage : undefined,
    damageRate: modern ? weapon.damageRate || 0 : 0, masteryDamageRate: maintainedSkillBonuses(state).damageRate || 0 }).damage;
  return { min: damage(min), max: damage(max) };
}
