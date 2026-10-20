// Progress is in game milliseconds, never an absolute wall/monotonic timestamp.
export const COMBAT_RULES_VERSION = 5;
export const DEFAULT_SPEED = Object.freeze({ base: 100, perDEX: 5, minimum: 1, baseIntervalMs: 2200, maxEventsPerTick: 500 });
export function actionSpeed(DEX = 0, penalty = 0, config = {}) {
  const c = { ...DEFAULT_SPEED, ...config.actionSpeed };
  if (![c.base, c.minimum, c.baseIntervalMs].every(v => Number.isFinite(v) && v > 0) || !Number.isFinite(c.perDEX) || c.perDEX < 0) throw Error('Invalid action speed configuration');
  if (!Number.isFinite(DEX) || !Number.isFinite(penalty) || penalty < 0 || penalty > .5) throw Error('Invalid action speed input');
  const baseActionSpeed = Math.max(c.minimum, c.base + DEX * c.perDEX);
  const speed = baseActionSpeed * (1 - penalty);
  return { baseActionSpeed, actionSpeed: speed, actionSpeedPenaltyRate: penalty, actionIntervalMs: c.baseIntervalMs * c.base / speed };
}
export const newCombatants = () => ({ hero: { readiness: 0, actionSeq: 0 }, enemy: { readiness: 0, actionSeq: 0 } });
export function migrateBattle(state, heroAlive) {
  const b = state.battle;
  if (!b || b.rulesVersion >= COMBAT_RULES_VERSION) return;
  b.combatants = newCombatants(); b.elapsedMs = 0; b.actionSeq ??= 0;
  b.skillUsed ??= false;
  if (state.phase === 'BATTLE' && heroAlive && state.enemy?.hp > 0) {
    b.transition = { actor: b.actor === 'enemy' ? 'enemy' : 'hero', remainingMs: Math.max(0, Number(state.remaining) || 0), durationMs: Math.max(0, Number(state.duration) || 0) };
  }
  for (const key of ['turn','actor','firstActor','ap','attacks','roundTactic','roundEffects','heroReservedAP','tacticUsed']) delete b[key];
  b.rulesVersion = COMBAT_RULES_VERSION;
}
export function nextAction(b, intervals, tieWinner = 'hero') {
  const waits = Object.fromEntries(['hero','enemy'].map(actor => [actor, Math.max(0, 1 - b.combatants[actor].readiness) * intervals[actor]]));
  const actor = Math.abs(waits.hero - waits.enemy) < 1e-7 ? tieWinner : waits.hero < waits.enemy ? 'hero' : 'enemy';
  return { actor, wait: waits[actor] };
}
export function advanceReadiness(b, intervals, elapsed) {
  b.elapsedMs += elapsed;
  for (const actor of ['hero','enemy']) b.combatants[actor].readiness += elapsed / intervals[actor];
}
