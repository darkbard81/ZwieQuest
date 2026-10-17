// One playback contract for every appearance, the world and inn previews.
export const SPRITE_FRAME_COUNT = 24;
export const PLAYBACK = {
  Front_Idle: { duration: 2000, loop: true },
  Front_Victory: { duration: 2000 },
  Side_Walk: { duration: 1200, loop: true },
  Side_Attack: { duration: 650 },
  Side_Hit: { duration: 360 },
  Side_Down: { duration: 1500 }
};
export function sampleAnimationFrame(action, elapsed, reduced = false) {
  if (reduced) return action === 'Side_Down' ? 23 : action === 'Front_Victory' ? 12 : 0;
  const spec = PLAYBACK[action];
  const frame = Math.floor(Math.max(0, elapsed) / spec.duration * SPRITE_FRAME_COUNT);
  return spec.loop ? frame % SPRITE_FRAME_COUNT : Math.min(SPRITE_FRAME_COUNT - 1, frame);
}
export function createHeroAnimator() {
  let state = null, phaseKey = '', phaseAt = 0, sequence = [];
  function clear() { sequence = []; }
  return {
    update(next, now) {
      const key = next ? `${next.appearanceId || next.classId}:${next.mapId}:${next.run}:${next.currentNodeId}:${next.phase}` : '';
      if (key !== phaseKey) { phaseAt = !state && next?.phase === 'DOWNED' ? now - PLAYBACK.Side_Down.duration : now; clear(); }
      phaseKey = key; state = next;
    },
    clear,
    events(events, now) {
      if (!state) return;
      const hits = events.filter(e => e.type === 'hit' && e.hit);
      const hit = hits.at(-1)?.hit;
      const victory = events.some(e => e.type === 'victory' || e.type === 'boss');
      const down = state.phase === 'DOWNED';
      const actions = [];
      if (hit?.actor === 'hero' && ['BATTLE', 'TREASURE'].includes(state.phase)) actions.push('Side_Attack');
      if (hit?.actor === 'enemy' && hit.damage > 0 && ['BATTLE', 'DOWNED'].includes(state.phase)) actions.push('Side_Hit');
      if (down && actions.length) actions.push('Side_Down');
      else if (victory && state.phase === 'TREASURE') actions.push('Front_Victory');
      if (!actions.length) return;
      let at = now;
      sequence = actions.map(action => { const item = { action, at }; at += PLAYBACK[action].duration; return item; });
    },
    sample(now, reduced = false) {
      const s = state || { phase: 'HOME', classId: 'warrior' };
      let action = 'Front_Idle', elapsed = now - phaseAt, hold = false;
      if (s.phase === 'TRAVEL') action = 'Side_Walk';
      else if (s.phase === 'BATTLE') { action = 'Side_Attack'; elapsed = 0; }
      else if (s.phase === 'DOWNED') { action = 'Side_Down'; hold = true; }
      else if (s.phase === 'RETURN_HOME' && s.lastSummary?.downed) { action = 'Side_Down'; elapsed = PLAYBACK.Side_Down.duration; hold = true; }
      const active = sequence.filter(item => item.at <= now).at(-1);
      if (active) {
        const age = now - active.at;
        if (age < PLAYBACK[active.action].duration || (active.action === 'Side_Down' && s.phase === 'DOWNED')) {
          action = active.action; elapsed = age; hold = true;
        } else if (active === sequence.at(-1)) clear();
      }
      const frame = sampleAnimationFrame(action, elapsed, reduced);
      return { classId: s.classId || 'warrior', action, frame, mirrored: action === 'Side_Walk' && s.direction === 'left', transient: hold, hurt: action === 'Side_Hit' };
    }
  };
}
