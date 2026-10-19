import { Game } from './game.js';

// Called only after the server has checked the account's stored administrator role.
export function prepareAdminGame(game, revealAgain = false) {
  const s = game.state;
  if (s.adminExplorationGranted && !revealAgain) return;
  for (const [id, map] of Object.entries(s.maps)) {
    s.exploredNodes[id] = Object.keys(map.nodes);
    if (id !== 'village' && !s.checkpointHistory.some(c => c.mapId === id)) {
      s.checkpointHistory.push({ mapId: id, nodeId: map.rootId, firstPassedAt: Date.now() });
    }
  }
  s.adminExplorationGranted = true;
  game.log('map', '관리자 모험가 · 모든 지역의 지도와 체크포인트 기록을 획득했습니다.');
}

// Explicit maintenance only: never reroll an existing account during normal loading.
export function regenerateAdminMaps(game) {
  if (!game.state) throw Error('지도를 재생성할 모험가가 없습니다.');
  game.installMaps();
  Object.assign(game.state, { choiceId: null, pendingBossReturn: false, lastBossRewardId: null, lastReward: null, risk: 0 });
  game.phase('HOME', game.config.homeMs);
  prepareAdminGame(game, true);
  game.log('map', '관리자 지도 재생성 · 성장과 장비를 유지하고 새 지도의 마을에서 다시 출발합니다.');
}

export function resetGameProgress(game, isAdmin) {
  if (!game.state) throw Error('초기화할 모험가가 없습니다.');
  const old = game.state, fresh = new Game(game.config);
  // Maps belong to the account; reset discovery, not the account's geography.
  fresh.state.maps = structuredClone(old.maps);
  fresh.state.currentNodeId = fresh.state.maps.village.rootId;
  fresh.state.exploredNodes = {};
  fresh.rememberExploration();
  if (isAdmin) fresh.state.adminExplorationGranted = true;
  // Keep cursors monotonic so connected tabs do not replay or ignore new events.
  fresh.state.version = old.version + 1;
  fresh.state.eventSeq = old.eventSeq;
  fresh.state.resetAt = Date.now();
  fresh.events = [];
  fresh.log('home', '계정 초기화 · 캐릭터 0명, 소지품 없음, 금화 0으로 여관에서 다시 시작합니다.');
  return fresh;
}
