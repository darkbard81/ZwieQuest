export const MAP_DEFS = {
  village: { name: '바람꽃 마을', subtitle: '모든 여행이 시작되는 곳', terminals: [...Array.from({ length: 6 }, (_, i) => ({ kind: 'deadend', label: `마을 막다른 길 ${i + 1}` })), ...['volcano', 'snow', 'desert', 'beach'].map(region => ({ kind: 'exit', region, label: { volcano: '화산으로 가는 길', snow: '설원으로 가는 길', desert: '사막으로 가는 길', beach: '해변으로 가는 길' }[region] }))] },
  volcano: { name: '잿불 화산', subtitle: '붉은 산맥 깊이 잠든 수호자', boss: '잿불의 군주' },
  snow: { name: '별빛 설원', subtitle: '고요한 눈길 끝의 온기', boss: '서리 왕관' },
  desert: { name: '황금빛 사막', subtitle: '모래 아래 잠든 작은 비밀', boss: '사막의 파수꾼' },
  beach: { name: '푸른달 해변', subtitle: '파도 너머 들려오는 노래', boss: '밀물의 수호자' }
};
export const MAP_VERSION = 2;
// Generation rules are independent of the saved graph format. Existing trees stay intact.
export const MAP_GENERATION_VERSION = 3;
const directions = ['left', 'right'];

function shuffle(items, rng) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = rng(i + 1); [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// All regions share the same forward branching rules; only their destinations differ.
export function generateMap(id, rng) {
  const def = MAP_DEFS[id], depth = 10, nodes = {};
  const terminals = def.terminals || [{ kind: 'boss', label: def.boss }];
  const destinations = terminals.map((terminal, i) => ({ id: `${id}:10:${i}`, depth, ...terminal }));
  const terminalIds = destinations.map(node => node.id);
  // Every branching node has two children, including the boss's final dead-end sibling.
  if (destinations.length % 2) destinations.push({ id: `${id}:10:dead:0`, depth, kind: 'deadend', label: '막다른 길', sideBranch: true });
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
      // The NEXT layer includes both continuing paths and dead ends in its depth*4 cap.
      const maximum = Math.min(layer.length, (d + 1) * 2);
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
