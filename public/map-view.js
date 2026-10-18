import { layoutMap, MAP_NODE_WIDTH, MAP_NODE_HEIGHT, MAP_ROW_HEIGHT } from './map-layout.js';
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const types = { start: '출발점', path: '갈림길', exit: '체크포인트', boss: '보스', deadend: '막다른 길' };

// Only explored nodes can expose their children. Unknown choices are identical
// leaves, so neither their labels nor the layout reveal what lies beyond them.
export function exploredMap(state) {
  const map = state.mapGraph;
  const explored = new Set([map.rootId, state.currentNodeId, ...(state.exploredNodes?.[map.id] || []), ...state.path.flatMap(p => [p.from, p.to])]);
  const nodes = {};
  function visit(id) {
    const node = map.nodes[id];
    if (!explored.has(id)) {
      nodes[id] = { id, depth: node.depth, kind: 'unknown', label: '미탐험' };
      return;
    }
    nodes[id] = node;
    for (const child of Object.values(node.edges || {})) visit(child);
  }
  visit(map.rootId);
  return { ...map, nodes, depth: Math.max(...Object.values(nodes).map(n => n.depth)) };
}

export function mapSVG(state, scale = 1) {
  const map = exploredMap(state), layout = layoutMap(map);
  let html = `<svg viewBox="0 0 ${layout.width} ${layout.height}" width="${layout.width * scale}" height="${layout.height * scale}" role="img" aria-label="${esc(map.name)} · 탐험한 경로와 미탐험 갈림길"><title>${esc(map.name)} 경로 지도</title>`;
  for (let depth = 0; depth <= map.depth; depth++) html += `<text class="map-depth" x="16" y="${68 + depth * MAP_ROW_HEIGHT}">${depth}</text>`;
  for (const edge of layout.edges) {
    const seen = map.nodes[edge.to].kind !== 'unknown';
    html += `<path class="map-edge-halo" d="${edge.path}"/><path class="map-edge${seen ? ' visited' : ''}" data-from="${esc(edge.from)}" data-to="${esc(edge.to)}" data-direction="${edge.direction}" d="${edge.path}"/>`;
    const labelX = (edge.points[1][0] + edge.points[2][0]) / 2;
    html += `<text class="map-branch" x="${labelX}" y="${edge.points[1][1] - 7}" text-anchor="middle">${edge.direction === 'left' ? '왼쪽' : '오른쪽'}</text>`;
  }
  for (const node of Object.values(map.nodes)) {
    const p = layout.positions[node.id], current = node.id === state.currentNodeId, seen = node.kind !== 'unknown';
    const passed = node.kind === 'exit' && state.checkpointHistory.some(c => c.mapId === node.region);
    const label = node.kind === 'path' ? (node.event === 'battle' ? '전투' : node.event === 'treasure' ? '보물' : '갈림길') : node.kind === 'start' ? (map.id === 'village' ? '여관 출발' : `${map.name} 출발`) : node.label;
    const detail = current ? '현재 위치' : node.kind === 'unknown' ? '목적지 알 수 없음' : passed ? '체크포인트 · 통과 기록' : `${types[node.kind]} · 탐험 완료`;
    html += `<g class="map-node ${node.kind}${seen ? ' visited' : ''}${current ? ' current' : ''}${passed ? ' passed' : ''}" data-node="${esc(node.id)}" data-kind="${node.kind}" data-depth="${node.depth}" transform="translate(${p.x},${p.y})"><title>${esc(node.label)} · ${esc(detail)}</title><rect x="${-MAP_NODE_WIDTH / 2}" y="${-MAP_NODE_HEIGHT / 2}" width="${MAP_NODE_WIDTH}" height="${MAP_NODE_HEIGHT}" rx="9"/><text class="map-node-label" text-anchor="middle" y="-3">${esc(label)}</text><text class="map-node-detail" text-anchor="middle" y="13">${esc(detail)}</text></g>`;
  }
  return html + '</svg>';
}
