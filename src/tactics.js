export const COMBAT_RULES_VERSION = 2;
export function availableTactics(classId, config) {
  return Object.entries(config.tactics).filter(([, t]) => !t.classId || t.classId === classId).map(([id, t]) => ({ id, ...t }));
}
export function validTactic(id, classId, config) {
  return availableTactics(classId, config).some(t => t.id === id);
}
export function tacticEffect(id, intelligence, config) {
  const t = config.tactics[id], INT = Math.max(0, intelligence);
  if (id === 'defend') return { AR: t.baseAR + Math.floor(INT / t.intDivisor) };
  if (id === 'assault') return { ACC: t.baseACC + INT * t.accPerINT };
  if (id === 'heal') return { heal: t.baseHeal + INT * t.healPerINT };
  if (id === 'burst') return { damageRate: t.baseDamageRate + INT * t.damageRatePerINT };
  return {};
}
export function validateTactics(config) {
  const t = config.tactics;
  if (!t || Object.keys(t).sort().join() !== ['assault', 'burst', 'defend', 'heal', 'normal'].join()) throw Error('Exactly five tactics are required');
  if (t.normal.cost !== 1 || t.normal.classId) throw Error('Normal attack must cost 1 AP and be shared');
  for (const [id, classId] of [['defend','warrior'],['assault','warrior'],['heal','wizard'],['burst','wizard']]) {
    if (t[id].cost !== 2 || t[id].classId !== classId) throw Error('Class tactic must cost 2 AP');
    for (const [key,value] of Object.entries(t[id])) if (!['name','classId'].includes(key) && (!Number.isFinite(value) || value < 0)) throw Error('Invalid tactic coefficient');
  }
  if (!(t.defend.intDivisor > 0) || ![t.defend.baseAR,t.assault.baseACC,t.heal.baseHeal,t.burst.baseDamageRate].every(n=>n>0)) throw Error('Tactics need a base effect at INT 0');
}
