export const MAP_DEFS = {
  village: { name: '바람꽃 마을', subtitle: '모든 여행이 시작되는 곳', terminals: [...Array.from({ length: 6 }, (_, i) => ({ kind: 'deadend', label: `마을 막다른 길 ${i + 1}` })), ...['volcano', 'snow', 'desert', 'beach'].map(region => ({ kind: 'exit', region, label: { volcano: '화산으로 가는 길', snow: '설원으로 가는 길', desert: '사막으로 가는 길', beach: '해변으로 가는 길' }[region] }))] },
  volcano: { name: '잿불 화산', subtitle: '붉은 산맥 깊이 잠든 수호자', boss: '잿불의 군주' },
  snow: { name: '별빛 설원', subtitle: '고요한 눈길 끝의 온기', boss: '서리 왕관' },
  desert: { name: '황금빛 사막', subtitle: '모래 아래 잠든 작은 비밀', boss: '사막의 파수꾼' },
  beach: { name: '푸른달 해변', subtitle: '파도 너머 들려오는 노래', boss: '밀물의 수호자' }
};
export const MAP_VERSION = 2;
const directions = ['left', 'right'];

// Reserve the authored destinations first, then build their parents backwards.
// A missing sibling becomes a dead end, rather than sharing a descendant.
export function generateMap(id, rng) {
  const def = MAP_DEFS[id], depth = 10, nodes = {};
  const terminals = def.terminals || [{ kind: 'boss', label: def.boss }];
  let layer = terminals.map((terminal, i) => {
    const node = { id: `${id}:10:${i}`, depth, ...terminal };
    nodes[node.id] = node; return node.id;
  });
  const terminalIds = [...layer];
  for (let d = depth - 1; d >= 0; d--) {
    // Shuffle siblings without changing the identity of destinations.
    for (let i = layer.length - 1; i > 0; i--) {
      const j = rng(i + 1); [layer[i], layer[j]] = [layer[j], layer[i]];
    }
    const parents = [];
    for (let i = 0; i < layer.length; i += 2) {
      let pair = layer.slice(i, i + 2);
      if (pair.length === 1) {
        const dead = { id: `${id}:${d + 1}:dead:${i}`, depth: d + 1, kind: 'deadend', label: '막다른 길', sideBranch: true };
        nodes[dead.id] = dead; pair.push(dead.id);
        if (rng(2)) pair.reverse();
      }
      const node = { id: `${id}:${d}:${parents.length}`, depth: d, kind: d === 0 ? 'start' : 'path',
        label: d === 0 ? (id === 'village' ? 'HOME' : `${def.name} 출발점`) : `${def.name} ${d}-${parents.length + 1}`,
        event: d % 3 === 0 ? 'treasure' : d % 3 === 2 ? 'battle' : 'pass', edges: { left: pair[0], right: pair[1] } };
      nodes[node.id] = node; parents.push(node.id);
    }
    layer = parents;
  }
  return { id, name: def.name, depth, rootId: layer[0], terminalIds, nodes, version: MAP_VERSION };
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
