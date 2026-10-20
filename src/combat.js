import { activeCharacter } from './characters.js';
import { actionSpeed } from './action-speed.js';
import { BASE_STATS } from './equipment.js';
const LEVEL_BONUS_INTERVAL = 3;
export const levelBonus = level => Math.floor((level - 1) / LEVEL_BONUS_INTERVAL);
const DEFENSE_RULES = {
  DEF: { attributes: ['RES'] },
  REF: { attributes: ['DEX', 'PER'] },
  FOR: { attributes: ['STR', 'CON'] },
  WIL: { attributes: ['INT', 'RES'] }
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
export function attack({ roll, acc, defense, str, base, pen, ar, damageTypes = ['blunt'], typeModifiers = {}, damageRate = 0, tacticDamageRate = 0, fixedDamage }) {
  const hit = hitResult(roll, acc, defense);
  const armor = effectiveArmor(ar, damageTypes, typeModifiers);
  const raw = armor.damageType === 'raw';
  if (raw && (!Number.isInteger(fixedDamage) || fixedDamage < 0)) throw Error('Raw requires nonnegative fixed damage');
  const factors = raw ? null : { grade: 1 + damageRate, tactic: 1 + tacticDamageRate, strength: 1 + .05 * str, hit: hit.multiplier, armor: penetration(pen, armor.effectiveAR) };
  const damage = raw ? (hit.tier === 0 ? 0 : fixedDamage) : Math.floor(base * factors.grade * factors.tactic * factors.strength * factors.hit * factors.armor);
  return { ...hit, ...armor, damage, base, damageRate, tacticDamageRate, pen: raw ? null : pen, ar,
    calculation: { acc, defense, factors, fixedDamage: raw ? fixedDamage : null } };
}
export function stats(state, config) {
  return statDetails(state, config).values;
}
// Values and their displayed breakdown share the same authoritative calculation.
export function statDetails(state, config, character = activeCharacter(state)) {
  const cls = config.character;
  if (!character) return { values: { ...Object.fromEntries([...BASE_STATS, 'ACC', 'DEF', 'REF', 'FOR', 'WIL', 'LB', 'PEN', 'AR', 'power'].map(k => [k, 0])), maxHp: 0, ...actionSpeed(0, 0, config), typeModifiers: {} }, defenses: {} };
  const lb = levelBonus(character.level);
  const gear = Object.values(character.equipment).map(id => state.inventory.find(i => i.id === id)).filter(Boolean);
  const e = key => gear.reduce((sum, i) => sum + (key === 'DEX' && i.slot === 'armor' ? 0 : i.stats[key] || 0), 0);
  const b = Object.fromEntries(BASE_STATS.map(key => [key, character.attributes[key] + e(key)]));
  const defenses = Object.fromEntries(Object.entries(DEFENSE_RULES).map(([key, rule]) => {
    const attributes = rule.attributes.map(key => ({ key, base: character.attributes[key], equipment: e(key), value: b[key] }));
    const detail = { base: cls.B[key], attributes, level: character.level, levelBonus: lb, levelBonusInterval: LEVEL_BONUS_INTERVAL, equipment: e(key), mastery: null };
    detail.total = detail.base + attributes.reduce((sum, a) => sum + a.value, 0) + lb + detail.equipment;
    return [key, detail];
  }));
  const values = {
    ...b, LB: lb,
    ACC: cls.B.ACC + b.PER + lb + e('ACC'),
    ...Object.fromEntries(Object.entries(defenses).map(([key, detail]) => [key, detail.total])),
    maxHp: cls.hp + cls.hpGrowth * (character.level - 1) + 5 * b.CON + e('HP'),
    PEN: e('PEN'), AR: e('AR'), power: e('power'),
    ...actionSpeed(b.DEX, gear.find(i => i.slot === 'armor')?.actionSpeedPenaltyRate || 0, config),
    typeModifiers: { ...(gear.find(i => i.slot === 'armor')?.typeModifiers || {}) }
  };
  return { values, defenses };
}
