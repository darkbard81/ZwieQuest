export function routeTo(map, from, target) {
  if (from === target) return [];
  for (const [direction, to] of Object.entries(map.nodes[from]?.edges || {})) {
    const rest = routeTo(map, to, target);
    if (rest) return [{ from, to, direction }, ...rest];
  }
  return null;
}

// Stable left-to-right numbers from the full saved tree, independent of discovery.
export function nodeLabels(map) {
  const counts = {}, labels = {};
  function visit(id) {
    const node = map.nodes[id];
    const index = counts[node.depth] = (counts[node.depth] || 0) + 1;
    labels[id] = id === map.rootId ? '출발점' : `${node.depth}-${index}`;
    for (const direction of ['left', 'right']) if (node.edges?.[direction]) visit(node.edges[direction]);
  }
  visit(map.rootId);
  return labels;
}

// HOME previews the selected departure map while the hero still rests at the inn.
export function mapViewState(state) {
  if (state.phase !== 'HOME') return state;
  return { ...state, mapId: state.mapGraph.id, step: 0, currentNodeId: state.mapGraph.rootId, path: [] };
}
