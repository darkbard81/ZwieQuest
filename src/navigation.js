export { routeTo } from '../public/map-navigation.js';

// Checkpoints are account-owned unlocks. Never accept a client-supplied unlock list.
export function availableStarts(state) {
  return Object.keys(state.maps).filter(id => id === 'village' || state.checkpointHistory.some(c => c.mapId === id && c.nodeId === state.maps[id].rootId));
}

export function navigationPosition(state) {
  const mapId = state.phase === 'HOME' ? state.departureMapId : state.mapId;
  return { mapId, nodeId: state.phase === 'HOME' ? state.maps[mapId].rootId : state.currentNodeId };
}

export function visibleTarget(state, mapId, nodeId) {
  const map = state.maps[mapId], known = new Set([map.rootId, ...(state.exploredNodes[mapId] || [])]);
  return known.has(nodeId) || Object.values(map.nodes).some(n => known.has(n.id) && Object.values(n.edges || {}).includes(nodeId));
}
