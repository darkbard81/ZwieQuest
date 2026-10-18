export const MAP_NODE_WIDTH = 144;
export const MAP_NODE_HEIGHT = 44;
export const MAP_ROW_HEIGHT = 116;
const siblingGap = MAP_NODE_WIDTH + 40;

// Merge subtree contours, not depth-wide rows. Left and right subtrees retain
// their order at every depth, with room for labels and orthogonal connectors.
export function layoutMap(map) {
  function place(id) {
    const node = map.nodes[id];
    if (!node.edges) return { points: { [id]: 0 }, left: [0], right: [0] };
    const a = place(node.edges.left), b = place(node.edges.right);
    let distance = siblingGap;
    for (let d = 0; d < Math.min(a.right.length, b.left.length); d++) distance = Math.max(distance, a.right[d] - b.left[d] + siblingGap);
    const shift = distance / 2, points = { [id]: 0 }, left = [0], right = [0];
    for (const [key, x] of Object.entries(a.points)) points[key] = x - shift;
    for (const [key, x] of Object.entries(b.points)) points[key] = x + shift;
    for (let d = 0; d < Math.max(a.left.length, b.left.length); d++) {
      left.push(Math.min(a.left[d] == null ? Infinity : a.left[d] - shift, b.left[d] == null ? Infinity : b.left[d] + shift));
      right.push(Math.max(a.right[d] == null ? -Infinity : a.right[d] - shift, b.right[d] == null ? -Infinity : b.right[d] + shift));
    }
    return { points, left, right };
  }
  const { points } = place(map.rootId), xs = Object.values(points);
  const min = Math.min(...xs), max = Math.max(...xs), width = Math.max(800, max - min + MAP_NODE_WIDTH + 160);
  const offset = (width - (max - min)) / 2 - min;
  const positions = Object.fromEntries(Object.entries(points).map(([id, x]) => [id, { x: x + offset, y: 64 + map.nodes[id].depth * MAP_ROW_HEIGHT }]));
  const edges = [];
  for (const node of Object.values(map.nodes)) for (const [direction, to] of Object.entries(node.edges || {})) {
    const a = positions[node.id], b = positions[to], middle = (a.y + b.y) / 2;
    const segments = [[a.x, a.y + MAP_NODE_HEIGHT / 2], [a.x, middle], [b.x, middle], [b.x, b.y - MAP_NODE_HEIGHT / 2]];
    edges.push({ from: node.id, to, direction, points: segments, path: `M${segments[0][0]},${segments[0][1]} V${middle} H${b.x} V${segments[3][1]}` });
  }
  return { positions, edges, width, height: 128 + map.depth * MAP_ROW_HEIGHT };
}
