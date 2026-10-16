// One local, constant-speed pan per journey: center to the directional edge.
const PAN_MS = 6000;
export function createTravelCamera() {
  let travelKey = null, startedAt = 0, direction = 'right';
  return {
    update(state, now) {
      const key = state?.phase === 'TRAVEL'
        ? `${state.mapId}:${state.run}:${state.currentNodeId}:${state.phaseStartedAt}:${state.direction}` : null;
      if (key !== travelKey) { travelKey = key; startedAt = now; direction = state?.direction; }
    },
    sample(now, imageWidth, reduced = false) {
      const overflow = Math.max(0, imageWidth - 512);
      const progress = travelKey && !reduced ? Math.min(1, Math.max(0, now - startedAt) / PAN_MS) : 0;
      const fraction = .5 + (direction === 'left' ? -.5 : .5) * progress;
      return { x: -overflow * fraction || 0, progress, fraction, overflow };
    }
  };
}
