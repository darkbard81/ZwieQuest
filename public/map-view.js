import { layoutMap, MAP_NODE_WIDTH, MAP_NODE_HEIGHT, MAP_ROW_HEIGHT } from './map-layout.js';
import { mapViewState, nodeLabels, routeTo } from './map-navigation.js';
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Only explored nodes can expose their children. Unknown choices are identical
// leaves, so neither their labels nor the layout reveal what lies beyond them.
export function exploredMap(state) {
  state = mapViewState(state);
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

export function mapSVG(state, scale = 1, regions = []) {
  state = mapViewState(state);
  const map = exploredMap(state), layout = layoutMap(map), labels = nodeLabels(state.mapGraph);
  const target = state.autoRoute?.mapId === map.id ? state.autoRoute.nodeId : null;
  const planned = new Set((target ? routeTo(map, state.currentNodeId, target) || [] : []).map(edge => edge.to));
  let html = `<svg viewBox="0 0 ${layout.width} ${layout.height}" width="${layout.width * scale}" height="${layout.height * scale}" role="img" aria-label="${esc(map.name)} · 탐험한 경로와 미탐험 갈림길"><title>${esc(map.name)} 경로 지도</title>`;
  for (let depth = 0; depth <= map.depth; depth++) html += `<text class="map-depth" x="16" y="${68 + depth * MAP_ROW_HEIGHT}">${depth}</text>`;
  for (const edge of layout.edges) {
    const seen = map.nodes[edge.to].kind !== 'unknown';
    html += `<path class="map-edge-halo" d="${edge.path}"/><path class="map-edge${seen ? ' visited' : ''}${planned.has(edge.to) ? ' planned' : ''}" data-from="${esc(edge.from)}" data-to="${esc(edge.to)}" data-direction="${edge.direction}" d="${edge.path}"/>`;
    const labelX = (edge.points[1][0] + edge.points[2][0]) / 2;
    html += `<text class="map-branch" x="${labelX}" y="${edge.points[1][1] - 7}" text-anchor="middle">${edge.direction === 'left' ? '왼쪽' : '오른쪽'}</text>`;
  }
  for (const node of Object.values(map.nodes)) {
    const p = layout.positions[node.id], current = node.id === state.currentNodeId, seen = node.kind !== 'unknown';
    const passed = (node.kind === 'exit' && state.checkpointHistory.some(c => c.mapId === node.region)) ||
      (node.id === map.rootId && state.checkpointHistory.some(c => c.mapId === map.id && c.nodeId === node.id));
    const checkpoint = seen && (node.kind === 'exit' || (node.id === map.rootId && (map.id === 'village' || passed)));
    const connectionName = node.kind === 'exit' ? (regions.find(region => region.id === node.region)?.name || state.availableStarts?.find(region => region.id === node.region)?.name || node.label) : map.name;
    const label = seen ? labels[node.id] : '미탐험';
    let detail = node.id === target ? '자동 이동 목표' : current ? (state.phase === 'HOME' ? '출발 예정' : '현재 위치') : !seen ? '목적지 알 수 없음' : passed ? '통과 기록' : node.kind === 'exit' ? '' : node.kind === 'boss' ? '보스' : '탐험 완료';
    if (checkpoint) detail = connectionName + (detail ? ` · ${detail}` : '');
    if (node.kind === 'boss' && !detail.includes('보스')) detail = `보스 · ${detail}`;
    const selectable = !current && ['HOME', 'CHOICE_WAIT', 'TRAVEL', 'BATTLE', 'TREASURE'].includes(state.phase) && !!routeTo(map, state.currentNodeId, node.id)?.length;
    const tooltip = seen && ['exit', 'boss'].includes(node.kind) ? `${label} · ${node.label}` : label;
    const marker = checkpoint ? '<path class="map-checkpoint-marker" d="M -59 -7 l6 6 -6 6 -6 -6 Z" aria-hidden="true"/>' : node.kind === 'boss' ? '<circle class="map-boss-marker" cx="-59" cy="-1" r="5" aria-hidden="true"/>' : '';
    html += `<g class="map-node ${node.kind}${seen ? ' visited' : ''}${checkpoint ? ' checkpoint' : ''}${current ? ' current' : ''}${passed ? ' passed' : ''}${node.id === target ? ' target' : ''}${selectable ? ' selectable' : ''}"${selectable ? ` role="button" tabindex="0" aria-label="${esc(label)}까지 자동 이동"` : ''} data-node="${esc(node.id)}" data-kind="${node.kind}" data-depth="${node.depth}" transform="translate(${p.x},${p.y})"><title>${esc(tooltip)} · ${esc(detail)}</title><rect x="${-MAP_NODE_WIDTH / 2}" y="${-MAP_NODE_HEIGHT / 2}" width="${MAP_NODE_WIDTH}" height="${MAP_NODE_HEIGHT}" rx="9"/>${marker}<text class="map-node-label" text-anchor="middle" y="-3">${esc(label)}</text><text class="map-node-detail" text-anchor="middle" y="13">${esc(detail)}</text></g>`;
  }
  return html + '</svg>';
}
