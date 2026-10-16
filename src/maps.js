export const MAP_DEFS = {
  village: { name: '바람꽃 마을', subtitle: '모든 여행이 시작되는 곳', terminals: [...Array.from({ length: 6 }, (_, i) => ({ kind: 'deadend', label: `마을 막다른 길 ${i + 1}` })), ...['volcano', 'snow', 'desert', 'beach'].map(region => ({ kind: 'exit', region, label: { volcano: '화산으로 가는 길', snow: '설원으로 가는 길', desert: '사막으로 가는 길', beach: '해변으로 가는 길' }[region] }))] },
  volcano: { name: '잿불 화산', subtitle: '붉은 산맥 깊이 잠든 수호자', boss: '잿불의 군주' },
  snow: { name: '별빛 설원', subtitle: '고요한 눈길 끝의 온기', boss: '서리 왕관' },
  desert: { name: '황금빛 사막', subtitle: '모래 아래 잠든 작은 비밀', boss: '사막의 파수꾼' },
  beach: { name: '푸른달 해변', subtitle: '파도 너머 들려오는 노래', boss: '밀물의 수호자' }
};
// 1. Place destinations. 2. Reserve a connected, forward-only backbone.
// 3. Fill spare branches without replacing a single protected edge.
export function generateMap(id, rng) {
  const def = MAP_DEFS[id], depth = 10, terminals = def.terminals || [{ kind: 'boss', label: def.boss }];
  const nodes = {}, layers = Array.from({ length: depth + 1 }, () => []);
  terminals.forEach((t, i) => { const node = { id: `${id}:10:${i}`, depth, ...t }; nodes[node.id] = node; layers[depth].push(node.id); });
  for (let d = 0; d < depth; d++) {
    const width = Math.min(10, 2 ** d, terminals.length * 2 ** (depth - d));
    for (let i = 0; i < width; i++) { const node = { id: `${id}:${d}:${i}`, depth: d, kind: d === 0 ? 'start' : 'path', label: d === 0 ? (id === 'village' ? 'HOME' : `${def.name} 출발점`) : `${def.name} ${d}-${i + 1}`, event: d % 3 === 0 ? 'treasure' : d % 3 === 2 ? 'battle' : 'pass', edges: {} }; nodes[node.id] = node; layers[d].push(node.id); }
  }
  const protectedEdges = [];
  for (let d = 0; d < depth; d++) {
    const from = layers[d], to = layers[d + 1];
    // Every current node gets a continuing route; every next-layer node gets a parent.
    from.forEach((id, i) => { nodes[id].edges.left = to[i % to.length]; protectedEdges.push([id, 'left', to[i % to.length]]); });
    for (let i = from.length; i < to.length; i++) { const parent = from[(i - from.length) % from.length]; nodes[parent].edges.right = to[i]; protectedEdges.push([parent, 'right', to[i]]); }
  }
  for (let d = 0; d < depth; d++) for (const id of layers[d]) {
    if (nodes[id].edges.right) continue;
    if (d < depth - 1 && rng(100) < 20) {
      const dead = { id: `${id}:dead`, depth: d + 1, kind: 'deadend', label: '작은 막다른 길', sideBranch: true }; nodes[dead.id] = dead; nodes[id].edges.right = dead.id;
    } else { const next = layers[d + 1], first = nodes[id].edges.left; let target = next[rng(next.length)]; if (next.length > 1 && target === first) target = next[(next.indexOf(first) + 1) % next.length]; nodes[id].edges.right = target; }
  }
  return { id, name: def.name, depth, rootId: layers[0][0], terminalIds: layers[depth], nodes, protectedEdges, version: 1 };
}
export function createMaps(rng) { return Object.fromEntries(Object.keys(MAP_DEFS).map(id => [id, generateMap(id, rng)])); }
export function reachable(map) { const seen = new Set(), queue = [map.rootId]; while (queue.length) { const id = queue.shift(); if (seen.has(id)) continue; seen.add(id); queue.push(...Object.values(map.nodes[id].edges || {})); } return seen; }
