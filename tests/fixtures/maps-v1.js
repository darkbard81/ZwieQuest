// Version-1 save fixture: retained only to verify non-destructive migration.
import { MAP_DEFS } from '../../src/maps.js';
// 1. Place destinations. 2. Reserve a connected, forward-only backbone.
// 3. Fill spare branches without replacing a single protected edge.
export function generateLegacyMap(id, rng) {
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
