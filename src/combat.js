import { activeCharacter } from './characters.js';
import { actionSpeed } from './action-speed.js';
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
// Shared character and monster HP; multiply before dividing to avoid rounding
// exact integer percentages down (e.g. 100 * 115 / 100 must be 115).
export function maximumHp(level, con, profile, equipmentHp = 0) {
  const baseHp = profile.hp + profile.hpGrowth * (level - 1);
  return Math.floor(baseHp * (100 + (profile.hpConPercent ?? 5) * con) / 100) + equipmentHp;
}
export function stats(state, config) {
  return statDetails(state, config).values;
}
// Values and their displayed breakdown share the same authoritative calculation.
export function statDetails(state, config, character = activeCharacter(state)) {
  const cls = config.character;
  if (!character) return { values: { ...Object.fromEntries([...BASE_STATS, 'ACC', 'DEF', 'REF', 'FOR', 'WIL', 'PEN', 'AR', 'power'].map(k => [k, 0])), maxHp: 0, ...actionSpeed(0, 0, config), typeModifiers: {} }, defenses: {} };
  const gear = Object.values(character.equipment).map(id => state.inventory.find(i => i.id === id)).filter(Boolean);
  const e = key => gear.reduce((sum, i) => sum + (key === 'DEX' && i.slot === 'armor' ? 0 : i.stats[key] || 0), 0);
  const b = Object.fromEntries(BASE_STATS.map(key => [key, character.attributes[key] + e(key)]));
  const defenses = Object.fromEntries(Object.entries(DEFENSE_RULES).map(([key, rule]) => {
    const attributes = Object.entries(rule.attributes).map(([key, multiplier]) => ({ key, base: character.attributes[key], equipment: e(key), value: b[key], multiplier, contribution: b[key] * multiplier }));
    const detail = { base: cls.B[key], attributes, level: character.level, equipment: e(key), mastery: null };
    detail.total = detail.base + attributes.reduce((sum, a) => sum + a.contribution, 0) + detail.equipment;
    return [key, detail];
  }));
  const values = {
    ...b,
    ACC: cls.B.ACC + b.PER + e('ACC'),
    ...Object.fromEntries(Object.entries(defenses).map(([key, detail]) => [key, detail.total])),
    maxHp: maximumHp(character.level, b.CON, cls, e('HP')),
    PEN: e('PEN'), AR: e('AR'), power: e('power'),
    ...actionSpeed(b.DEX, gear.find(i => i.slot === 'armor')?.actionSpeedPenaltyRate || 0, config, gear.find(i => i.slot === 'weapon')?.actionSpeedPenaltyRate || 0),
    typeModifiers: { ...(gear.find(i => i.slot === 'armor')?.typeModifiers || {}) }
  };
  return { values, defenses };
}
