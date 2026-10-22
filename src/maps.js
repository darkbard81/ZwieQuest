import { REGIONS, validateRegions } from './regions.js';
export function mapDefinitions(regions = REGIONS) {
  validateRegions(regions);
  return Object.fromEntries(Object.entries(regions).map(([id, region]) => [id, {
    name: region.name, subtitle: region.subtitle, depth: region.depth, boss: region.boss,
    terminals: [
      ...Array.from({ length: region.deadEnds }, (_, i) => ({ kind: 'deadend', label: `${id === 'village' ? '마을' : region.name} 막다른 길 ${i + 1}` })),
      ...region.exits.map(target => ({ kind: 'exit', region: target, label: `${regions[target].name} 연결` })),
      ...(region.boss ? [{ kind: 'boss', label: region.boss }] : [])
    ]
  }]));
}
export const MAP_DEFS = mapDefinitions();

export function refreshMapNames(map) {
  const def = MAP_DEFS[map.id], previousName = map.name;
  map.name = def.name;
  for (const node of Object.values(map.nodes)) {
    if (node.kind === 'exit') node.label = `${REGIONS[node.region].name} 연결`;
    else if (node.kind === 'start') node.label = map.id === 'village' ? 'HOME' : `${def.name} 출발점`;
    else if (node.kind === 'path' && previousName !== def.name && node.label.startsWith(previousName)) node.label = def.name + node.label.slice(previousName.length);
  }
}
export const MAP_VERSION = 2;
// Generation rules are independent of the saved graph format. Existing trees stay intact.
export const MAP_GENERATION_VERSION = 4;
const directions = ['left', 'right'];

export function maxNodes(d, depth = 10, terminalCount = 10) {
  if (d <= 4) return 2 ** d;
  // Preserve the depth-10 taper; longer maps keep a middle plateau.
  const endWidth = Math.max(10, terminalCount);
  return Math.min(Math.max(20, endWidth), 2 * (depth - d) + endWidth);
}

function shuffle(items, rng) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = rng(i + 1); [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// All regions share the same forward branching rules; only their destinations differ.
export function generateMap(id, rng, definitions = MAP_DEFS) {
  const def = definitions[id], depth = def.depth, nodes = {};
  const terminals = def.terminals || [{ kind: 'boss', label: def.boss }];
  const destinations = terminals.map((terminal, i) => ({ id: `${id}:${depth}:${i}`, depth, ...terminal }));
  const terminalIds = destinations.map(node => node.id);
  // Every branching node has two children, including the boss's final dead-end sibling.
  if (destinations.length % 2) destinations.push({ id: `${id}:${depth}:dead:0`, depth, kind: 'deadend', label: '막다른 길', sideBranch: true });
  const pathNode = (d, index) => ({
    id: `${id}:${d}:${index}`, depth: d, kind: d === 0 ? 'start' : 'path',
    label: d === 0 ? (id === 'village' ? 'HOME' : `${def.name} 출발점`) : `${def.name} ${d}-${index + 1}`
  });
  const root = pathNode(0, 0); nodes[root.id] = root;
  let layer = [root];
  for (let d = 0; d < depth; d++) {
    let continuing = layer.length;
    if (d === depth - 1) continuing = destinations.length / 2;
    else if (d >= 4) {
      // Count both continuing paths and dead ends against the NEXT layer cap.
      const maximum = Math.min(layer.length, Math.floor(maxNodes(d + 1, depth, destinations.length) / 2));
      // Keep several routes alive, and reserve enough capacity for every destination.
      const minimum = Math.max(Math.ceil(maximum / 2), Math.ceil(destinations.length / 2 ** (depth - d)));
      continuing = minimum + rng(maximum - minimum + 1);
    }
    const parents = shuffle(layer, rng);
    for (const node of parents.slice(continuing)) {
      node.kind = 'deadend'; node.label = '막다른 길'; node.sideBranch = true; delete node.event;
    }
    const next = d === depth - 1 ? shuffle(destinations, rng) : Array.from({ length: continuing * 2 }, (_, i) => pathNode(d + 1, i));
    for (let i = 0; i < continuing; i++) {
      const parent = parents[i]; parent.edges = {};
      for (const [offset, direction] of directions.entries()) {
        const child = next[i * 2 + offset]; nodes[child.id] = child; parent.edges[direction] = child.id;
      }
    }
    layer = next;
  }
  return { id, name: def.name, depth, rootId: root.id, terminalIds, nodes, version: MAP_VERSION, generationVersion: MAP_GENERATION_VERSION };
}

// Keep every original node/event and its ID. Only duplicate incoming edges
// become new leaves; the player's already-selected route has priority.
export function upgradeMap(map, preferredPath = []) {
  if (map.version >= MAP_VERSION) return map;
  const reserved = new Map(preferredPath.map(p => [p.to, `${p.from}/${p.direction}`]));
  const nodes = {};
  function visit(id) {
    const original = map.nodes[id], node = { ...original };
    nodes[id] = node;
    if (!original.edges) return;
    node.edges = {};
    for (const direction of directions) {
      const to = original.edges[direction];
      if (nodes[to] || (reserved.has(to) && reserved.get(to) !== `${id}/${direction}`)) {
        const deadId = `${id}:closed:${direction}`;
        nodes[deadId] = { id: deadId, depth: original.depth + 1, kind: 'deadend', label: '막다른 길', sideBranch: true };
        node.edges[direction] = deadId;
      } else {
        node.edges[direction] = to; visit(to);
      }
    }
  }
  visit(map.rootId);
  if (Object.keys(map.nodes).some(id => !nodes[id])) throw Error('기존 지도 노드를 보존하지 못했습니다.');
  const { protectedEdges, ...rest } = map;
  return { ...rest, nodes, version: MAP_VERSION };
}
export function migrateMaps(state) {
  let changed = false;
  for (const [id, map] of Object.entries(state.maps)) {
    if (map.version >= MAP_VERSION) continue;
    state.maps[id] = upgradeMap(map, id === state.mapId ? state.path || [] : []);
    changed = true;
  }
  return changed;
}
export function createMaps(rng) { return Object.fromEntries(Object.keys(MAP_DEFS).map(id => [id, generateMap(id, rng)])); }
export function reachable(map) { const seen = new Set(), queue = [map.rootId]; while (queue.length) { const id = queue.shift(); if (seen.has(id)) continue; seen.add(id); queue.push(...Object.values(map.nodes[id].edges || {})); } return seen; }
