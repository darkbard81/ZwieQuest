// Shared, texture-independent motion for every monster. No timers or effect queues.
export const MONSTER_MOTION = Object.freeze({ idleMs: 1800, attackMs: 360, hitMs: 180, downMs: 480 });
const contextKey = s => s ? JSON.stringify([s.progressId, s.activeCharacterId, s.mapId, s.run, s.currentNodeId]) : '';
const neutral = () => ({ action: 'idle', x: 0, scaleX: 1, scaleY: 1, alpha: 1, tint: 0xffffff });
export function createMonsterAnimator() {
  let state = null, context = '', battleId = null, visual = null, action = null, startedAt = 0;
  function clear() { action = null; if (state?.phase !== 'BATTLE') visual = null; }
  return {
    clear,
    update(next) {
      const nextContext = contextKey(next);
      if (nextContext !== context || (next?.phase === 'BATTLE' && (state?.phase !== 'BATTLE' || next.battle?.id !== battleId))) {
        visual = null; action = null;
      }
      // Retain only the immediately preceding opponent for live victory / final-attack events.
      if (next?.phase === 'BATTLE' && next.enemy) {
        visual = { enemy: { ...next.enemy }, theme: next.theme };
        battleId = next.battle?.id;
      } else if (!['TREASURE', 'DOWNED'].includes(next?.phase)) { visual = null; action = null; }
      state = next; context = nextContext;
    },
    events(events, now) {
      if (!visual || action === 'down') return;
      if (state.phase === 'TREASURE' && events.some(e => e.type === 'victory' || e.type === 'boss')) {
        action = 'down'; startedAt = now; return;
      }
      if (!['BATTLE', 'DOWNED'].includes(state.phase)) return;
      const hits = events.filter(e => e.type === 'hit' && e.hit).map(e => e.hit);
      // Damage takes priority over attack; repeated hits replace, never accumulate.
      if (state.phase === 'BATTLE' && hits.some(hit => (hit.targetActor || (hit.actor==='hero'?'enemy':'hero')) === 'enemy' && hit.damage > 0)) {
        action = 'hit'; startedAt = now;
      } else if ((hits.some(hit => hit.actor === 'enemy') || events.some(e=>e.type==='skill' && e.actor==='enemy')) && !(action === 'hit' && now - startedAt < MONSTER_MOTION.hitMs)) {
        action = 'attack'; startedAt = now;
      }
    },
    sample(now, reduced = false) {
      if (action && now - startedAt >= MONSTER_MOTION[`${action}Ms`]) {
        action = null;
        if (state?.phase !== 'BATTLE') visual = null;
      }
      if (!visual || (state?.phase !== 'BATTLE' && !action)) return null;
      const pose = { ...visual, ...neutral(), action: action || 'idle' };
      const age = Math.max(0, now - startedAt);
      if (action === 'down') {
        const t = Math.min(1, age / MONSTER_MOTION.downMs);
        pose.alpha = 1 - t;
        if (!reduced) { pose.scaleX = 1 + .18 * t; pose.scaleY = 1 - .8 * t; }
      } else if (action === 'hit') {
        const t = age / MONSTER_MOTION.hitMs;
        if (t < .65) pose.tint = 0xffbbbb;
        if (!reduced) { pose.x = 6 * Math.sin(Math.PI * t); pose.scaleX = 1 - .04 * Math.sin(Math.PI * t); }
      } else if (action === 'attack' && !reduced) {
        const t = age / MONSTER_MOTION.attackMs;
        if (t < .25) {
          const windup = t / .25;
          pose.x = 3 * windup; pose.scaleX = 1 + .06 * windup; pose.scaleY = 1 - .06 * windup;
        } else {
          const lunge = Math.sin(Math.PI * (t - .25) / .75);
          pose.x = 3 * (1 - t) / .75 - 20 * lunge;
          pose.scaleX = 1 + .06 * (1 - t) / .75 - .04 * lunge;
          pose.scaleY = 1 - .06 * (1 - t) / .75 + .04 * lunge;
        }
      } else if (!action && !reduced) {
        const breath = .03 * Math.sin(now * 2 * Math.PI / MONSTER_MOTION.idleMs);
        pose.scaleX = 1 + breath; pose.scaleY = 1 - breath;
      }
      return pose;
    }
  };
}
