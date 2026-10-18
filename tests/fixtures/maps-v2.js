// Original backwards tree generator: saved accounts must retain these routes.
import { MAP_DEFS } from '../../src/maps.js';

// Reserve the authored destinations first, then build their parents backwards.
// A missing sibling becomes a dead end, rather than sharing a descendant.
export function generatePreviousMap(id, rng) {
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
  return { id, name: def.name, depth, rootId: layer[0], terminalIds, nodes, version: 2 };
}
