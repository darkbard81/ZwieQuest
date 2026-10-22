import { nodeLabels } from '../public/map-navigation.js';
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

// A reserved goal is account-owned and survives journeys; old saves have none.
export function initializeReservedRoute(state) {
  const target = state.reservedRoute;
  if (!target || !state.maps[target.mapId]?.nodes?.[target.nodeId] || !availableStarts(state).includes(target.mapId)
      || !Number.isSafeInteger(target.startRun) || target.startRun < 0) state.reservedRoute = null;
}
export function navigationGoal(state) {
  const target = state.reservedRoute || state.autoRoute;
  const map = state.maps[target?.mapId];
  if (!map?.nodes[target?.nodeId]) return null;
  const active = state.autoRoute?.mapId === target.mapId && state.autoRoute.nodeId === target.nodeId;
  return { mapId: target.mapId, nodeId: target.nodeId, mapName: map.name, label: nodeLabels(map)[target.nodeId], reserved: !!state.reservedRoute, pending: !!state.reservedRoute && (!active || state.phase === 'HOME') };
}
