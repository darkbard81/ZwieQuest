export const levelBonus = level => Math.floor((level - 1) / 3);
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
  const damage = raw ? (hit.tier === 0 ? 0 : fixedDamage) : Math.floor(base * (1 + damageRate) * (1 + tacticDamageRate) * (1 + .05 * str) * hit.multiplier * penetration(pen, armor.effectiveAR));
  return { ...hit, ...armor, damage, base, damageRate, tacticDamageRate, pen: raw ? null : pen, ar };
}
export function stats(state, config) {
  const cls = config.classes[state.classId], b = cls.base, lb = levelBonus(state.level);
  const gear = Object.values(state.equipment).map(id => state.inventory.find(i => i.id === id)).filter(Boolean);
  const e = key => gear.reduce((sum, i) => sum + (i.stats[key] || 0), 0);
  const expert = state.level >= config.mastery.fromLevel;
  return {
    ...b, DEX: b.DEX + e('DEX'), LB: lb,
    ACC: cls.B.ACC + b.PER + lb + e('ACC') + (expert && state.classId === 'warrior' ? config.mastery.warriorACC : 0),
    DEF: cls.B.DEF + b.RES + lb + e('DEF'),
    FOR: cls.B.FOR + b.STR + b.CON + lb + e('FOR') + (expert && state.classId === 'warrior' ? config.mastery.warriorFOR : 0),
    REF: cls.B.REF + b.DEX + e('DEX') + b.PER + lb + e('REF'),
    WIL: cls.B.WIL + b.INT + b.RES + lb + e('WIL') + (expert && state.classId === 'wizard' ? config.mastery.wizardWIL : 0),
    maxHp: cls.hp + cls.hpGrowth * (state.level - 1) + 5 * b.CON + e('HP'),
    PEN: e('PEN'), AR: e('AR'), power: e('power'), AP: 3,
    typeModifiers: { ...(gear.find(i => i.slot === 'armor')?.typeModifiers || {}) }
  };
}
