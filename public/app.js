import { mapSVG } from './map-view.js';
import { REGIONS } from './regions.js';
import { mapViewState, nodeLabels } from './map-navigation.js';
import { initJournal } from './journal-view.js';
import { sortInventory } from './inventory-order.js';
import { initDefenseDetails } from './defense-details.js';
import { initInn } from './inn-view.js';
import { appearanceFor } from './appearances.js';
import { initSkills, skillDescription } from './skills-view.js';
import { itemIconHTML, itemDetailsHTML } from './equipment-view.js';
import { createWorld } from './render.js';
import { initWindows } from './windows.js';
import { initInfoTabs } from './tabs.js';
import { initAdminSettings } from './admin-settings.js';
import { initPasswordInput } from './password-input.js';
import { validPassword } from './password-policy.js';
import { createCombatFeed } from './combat-feedback.js';
import { statNames, statLabelHTML, defenseTooltip } from './labels.js';
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const phases = { HOME: '여관에서 휴식', TRAVEL: '길 위를 걷는 중', CHOICE_WAIT: '갈림길 선택', BATTLE: '자동 전투', TREASURE: '전리품 획득', RETURN_HOME: '탐험 완료', DOWNED: '안전 귀환 준비' };
const slotNames = { weapon: '무기', armor: '방어구', charm: '부적' };
let data = null, receivedAt = 0, user = null, source = null, connected = false, filter = 'all', inventoryKey = '', journalSeq = -1, toastTimer, authMode = 'login';
const equipmentViews = new Map();
let statsHTML = '';
const defenseDetails = initDefenseDetails($('#stats'), $('#defense-details'));
const clientId = crypto.randomUUID(); let lastHeartbeat = 0;
let world, choicePending = false;
const combatFeed = createCombatFeed();
const skills = initSkills({ bar: $('#skill-bar'), slots: $('#skill-slots'), summary: $('#skill-summary'), status: $('#battle-status'), onUse: (itemId, battleId, turn, button, mode, enabled) => command(mode === 'toggle' ? 'TOGGLE_SKILL' : 'USE_SKILL', { itemId, battleId, turn, ...(mode === 'toggle' ? { enabled } : {}) }, button) });
const inn = initInn({ panel: $('#inn-selection'), portrait: $('#portrait'), countdown: $('#rest-countdown'), onSelect: (appearanceId, button) => command('APPEARANCE', { appearanceId }, button) });
function updateInn() { inn.update(data?.state, receivedAt, data?.rate || 1, connected && !!user); }
createWorld($('#world')).then(w => { world = w; if (data?.state) w.update(data.state); }).catch(e => { $('#render-error').hidden = false; $('#render-error').textContent = '게임 화면을 불러오지 못했습니다. 새로고침해 주세요. ' + e.message; console.error(e); });
initWindows();
const journal = initJournal($('#journal'), $('#journal-panel'), $('#journal-unread'));
initInfoTabs();
function toast(text) { $('#toast').textContent = text; $('#toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 3600); }
async function api(path, body) {
  const r = await fetch(path, body === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await r.json();
  if (r.status === 401) { disconnect(); user = null; showAuth(); }
  if (!r.ok) { if (result.state) receive(result); throw Object.assign(Error(result.error || '서버에 연결할 수 없습니다.'), { status: r.status }); } return result;
}
async function command(type, fields = {}, button) {
  if (!connected) { toast('서버 연결을 기다려 주세요.'); return; }
  if (button?.classList.contains('busy')) return;
  button?.classList.add('busy');
  try { receive(await api('/api/command', { type, ...fields, progressId: data?.state?.progressId, requestId: crypto.randomUUID() })); }
  catch (e) { toast(e.message); }
  finally { button?.classList.remove('busy'); }
}
function receive(next) {
  const reset = data?.state?.progressId && next.state?.progressId && data.state.progressId !== next.state.progressId;
  if (reset) { journal.reset(); journalSeq = -1; inventoryKey = ''; choicePending = false; world?.clearTransient(); }
  const combatEvents = combatFeed.consume(next, connected && !reset);
  data = next; receivedAt = performance.now(); connected = true;
  $('#connection').classList.remove('lost'); $('#connection').innerHTML = `<i></i>${next.mode === 'ONLINE' ? '온라인' : '오프라인'} · ${next.rate}×`;
  $('#server-status').textContent = 'SERVER LIVE · SAVED';
  updateInn();
  skills.update(next.state, next.serverTime, receivedAt, connected);
  const s = next.state; $('#world').dataset.phase = s?.phase || 'HOME'; updateChoices();
  if (!s) { world?.update(null); if (user && !$('#welcome').open) $('#welcome').showModal(); return; }
  if ($('#welcome').open) $('#welcome').close(); world?.update(s); world?.playEvents(combatEvents);
  const theme = next.themes.find(t => t.id === s.theme);
  $('#biome-tag').textContent = s.phase === 'HOME' ? 'PUB / REST' : REGIONS[s.theme].tag;
  $('#biome-name').textContent = s.phase === 'HOME' ? '여행자의 여관' : theme.name; $('#biome-sub').textContent = s.phase === 'HOME' ? '잠시 쉬며 다음 여행을 준비해요' : theme.subtitle; $('#phase-badge').textContent = s.enemy?.boss && s.phase === 'BATTLE' ? '지역 보스전' : phases[s.phase];
  $('#journey-summary').textContent = `완료한 여행 ${s.completed}회 · 승리 ${s.victories}회 · 보물 ${s.chests}개`; $('#gold-total').textContent = s.gold.toLocaleString();
  $('#class-label').textContent = s.classId.toUpperCase(); $('#hero-name').textContent = appearanceFor(s).name; $('#hero-level').textContent = `Lv. ${s.level} · ${user?.username || '모험가'}`;
  $('#hp-label').textContent = `${s.hp} / ${s.stats.maxHp}`; $('#hp-fill').style.width = `${100 * s.hp / s.stats.maxHp}%`;
  $('#xp-label').textContent = `${s.xp} / ${s.xpNext}`; $('#xp-fill').style.width = `${100 * s.xp / s.xpNext}%`;
  const nextStatsHTML = `<div class="combat-stats">${['ACC', 'PEN', 'AR', 'LB'].map(k => `<div><small>${statLabelHTML(k)}</small><b>${(s.combatStats || s.stats)[k]}</b></div>`).join('')}</div><div class="defense-stats">${['DEF', 'REF', 'FOR', 'WIL'].map(k => statLabelHTML(k, s.stats[k], defenseTooltip(k, s.defenseBreakdown?.[k]))).join('')}</div><div class="base-stats">${['STR', 'CON', 'DEX', 'PER', 'INT', 'RES'].map(k => `<span>${statLabelHTML(k)} <b>${s.stats[k]}</b></span>`).join('')}</div>`;
  // Preserve hovered defense badges across unchanged server snapshots.
  if (nextStatsHTML !== statsHTML) { $('#stats').innerHTML = nextStatsHTML; statsHTML = nextStatsHTML; }
  defenseDetails.update();
  $('#stats').title = ['STR', 'CON', 'DEX', 'PER', 'INT', 'RES', 'DEF', 'FOR', 'REF', 'WIL', 'LB'].map(k => `${statNames[k]} ${s.stats[k]}`).join(' · ');
  $('#class-switch').disabled = s.phase !== 'HOME';
  renderEquipment(s);
  renderInventory(s);
  $('#scene-location').textContent = s.phase === 'HOME' ? `${theme.name} · ${s.mapId === 'village' ? 'HOME' : '출발점'}` : theme.name;
  $('#scene-direction').textContent = s.phase === 'TRAVEL' ? `${s.direction === 'left' ? '←' : '→'} 새로운 길을 향해` : '성장은 자동으로, 선택은 자유롭게';
  $('#enemy-hud').hidden = !s.enemy || s.phase !== 'BATTLE';
  if (s.enemy) $('#enemy-hud').innerHTML = `${esc(s.enemy.name)} · ${s.enemy.hp}/${s.enemy.maxHp}<div class="meter"><div style="width:${100 * s.enemy.hp / s.enemy.maxHp}%"></div></div>`;
  $('#scene-notice').textContent = s.phase === 'TREASURE' ? (s.lastReward?.itemName ? `${s.lastReward.itemName} 획득!` : `${s.lastReward?.kind === 'treasure' ? '보물상자에서' : '전투 보상으로'} 경험치와 금화를 얻었어요.`) : s.phase === 'DOWNED' ? '괜찮아요. 여관에서 다시 시작하면 돼요.' : '';
  $('#return-overlay').hidden = s.phase !== 'RETURN_HOME';
  if (s.phase === 'RETURN_HOME') $('#return-overlay').innerHTML = `<small>JOURNEY COMPLETE</small><h2>${s.lastSummary?.downed ? '무사히 돌아왔어요' : s.lastSummary?.reason === 'boss' ? '수호자를 넘어섰어요' : '길 끝에서, 다시 출발'}</h2><p>${s.run}번째 여행 · ${theme.name}</p><strong>+ ${s.lastSummary.gold} G</strong><p>성장과 전리품을 안전하게 저장했습니다.<br>마을의 집(HOME)으로 돌아갑니다.</p>`;
  if ($('#map-dialog')?.open) renderMap();
  if (journalSeq !== s.eventSeq) {
    journalSeq = s.eventSeq;
    journal.update(next.logs);
  }
}
function renderEquipment(s) {
  // Keep decoded images mounted across snapshots; update only a changed slot.
  for (const slot of ['weapon', 'armor', 'charm']) {
    const item = s.inventory.find(i => i.id === s.equipment[slot]);
    const title = item?.name || '빈 슬롯';
    const html = `${itemIconHTML(item, slot)}<span>${item ? esc(item.name) : slotNames[slot] + ' 없음'}</span>`;
    let view = equipmentViews.get(slot);
    if (!view) {
      const element = document.createElement('div');
      element.className = 'equip-slot';
      $('#equipment').append(element);
      view = { element, html: null };
      equipmentViews.set(slot, view);
    }
    if (view.html === html) continue;
    view.element.title = title;
    view.element.innerHTML = html;
    view.html = html;
  }
}
function renderInventory(s) {
  const key = JSON.stringify([s.inventory.map(({cooldown, ...item}) => item), s.equipment, s.skillSlots, s.equipmentUsers, s.classId, filter]); if (key === inventoryKey) return; inventoryKey = key;
  $('#item-count').textContent = `${s.inventory.length}개`;
  const sale = s.normalSale || { count: 0, gold: 0 };
  $('#sell-normal').textContent = `일반 일괄 판매 (${sale.count}개 · ${sale.gold} G)`;
  $('#sell-normal').disabled = !sale.count;
  const items = sortInventory(s, filter);
  $('#inventory-list').innerHTML = items.length ? items.map(item => {
    const skill = item.slot === 'skill';
    const equipped = skill ? s.skillSlots.includes(item.id) : Object.values(s.equipment).includes(item.id);
    if (skill) return `<article class="item skill-item"><div class="item-icon">${itemIconHTML(item)}</div><div><div class="item-heading"><h3>${esc(item.name)}${equipped ? '<span class="equipped">장착</span>' : ''}</h3><div class="item-actions"><button data-action="${equipped ? 'UNEQUIP' : 'EQUIP'}" data-item="${esc(item.id)}" ${!equipped && (!item.enabled || s.skillSlots.every(Boolean)) ? 'disabled' : ''}>${equipped ? '해제' : '장착'}</button></div></div><p>${esc(item.description)}<br>${esc(skillDescription(item))}<br>공용 스킬 · 최대 6개 장착 · 판매 불가</p></div></article>`;
    const users = s.equipmentUsers?.[item.id] || (equipped ? [s.classId] : []);
    const names = users.map(id => s.classProfiles?.[id]?.name || id).join('·');
    return `<article class="item ${!item.gradeId && item.tier >= 2 ? 'rare' : ''}" data-grade="${esc(item.gradeId || 'legacy')}"><div class="item-icon">${itemIconHTML(item)}</div><div><div class="item-heading"><h3><span class="rarity">${esc(item.rarity)}</span> ${esc(item.name)}${users.length ? `<span class="equipped">${esc(names)} 장착</span>` : ''}${item.special ? ' <span class="item-special">특수</span>' : ''}</h3><div class="item-actions"><button data-action="${equipped ? 'UNEQUIP' : 'EQUIP'}" data-item="${item.id}">${equipped ? '해제' : '장착'}</button><button class="sell" data-action="SELL" data-item="${item.id}" ${users.length ? `disabled title="${esc(names)} 직업에서 장착을 해제해 주세요"` : ''}>판매 ${item.value} G</button></div></div><p>${itemDetailsHTML(item)}</p></div></article>`;
  }).join('') : '<p class="muted">아직 발견한 장비가 없어요. 여행을 조금 더 지켜보세요.</p>';
}
$('#inventory-list').addEventListener('click', e => { const b = e.target.closest('[data-action]'); if (b) command(b.dataset.action, { itemId: b.dataset.item }, b); });
$('#sell-normal').onclick = e => command('SELL_NORMAL', {}, e.currentTarget);
$$('[data-filter]').forEach(b => b.onclick = () => { filter = b.dataset.filter; $$('[data-filter]').forEach(a => a.classList.toggle('active', a === b)); if (data?.state) renderInventory(data.state); });
function canChoose() {
  const s = data?.state;
  return !!(user && connected && !choicePending && s?.phase === 'CHOICE_WAIT' && s.choiceId && s.remaining > performance.now() - receivedAt);
}
function updateChoices() {
  const available = canChoose();
  $('#world').classList.toggle('choosing', data?.state?.phase === 'CHOICE_WAIT');
  $('#world-choices').hidden = !available;
  $('#choose-left').disabled = $('#choose-right').disabled = !available;
}
async function choose(direction) {
  if (!canChoose() || document.querySelector('dialog[open]')) { updateChoices(); return; }
  const choiceId = data.state.choiceId;
  choicePending = true; updateChoices();
  try { await command('CHOOSE', { direction, choiceId }); }
  finally { choicePending = false; updateChoices(); }
}
for (const direction of ['left', 'right']) $(`#choose-${direction}`).onclick = () => choose(direction);
addEventListener('keydown', e => { if (e.repeat || !['ArrowLeft', 'ArrowRight'].includes(e.key) || e.target.closest('input,textarea,select,dialog,[role=tablist]') || document.querySelector('dialog[open]') || data?.state?.phase !== 'CHOICE_WAIT') return; e.preventDefault(); $(`#choose-${e.key === 'ArrowLeft' ? 'left' : 'right'}`).click(); });
$('#class-switch').onclick = () => { const w = $('#world-window'); if (w.classList.contains('collapsed')) w.querySelector('.minimize').click(); inn.focus(); };
$$('[data-class]').forEach(b => b.onclick = () => command('CREATE', { classId: b.dataset.class }, b));
$('#welcome').addEventListener('cancel', e => e.preventDefault());
$('#help-button').onclick = () => $('#help').showModal(); $$('#help .dialog-close').forEach(b => b.onclick = () => $('#help').close());
async function presence(active = true) { if (!user) return; if (active) lastHeartbeat = Date.now(); try { await api('/api/presence', { clientId, active }); } catch (e) { if (active) $('#connection').classList.add('lost'); } }
function disconnect() { source?.close(); source = null; connected = false; skills.disconnect(); world?.clearTransient(); updateChoices(); updateInn(); $('#connection').classList.add('lost'); $('#connection').textContent = '연결 대기'; }
async function connect() {
  disconnect();
  try { receive(await api('/api/state')); await presence(); source = new EventSource('/api/events?clientId=' + clientId); source.onmessage = e => { receive(JSON.parse(e.data)); if (Date.now() - lastHeartbeat > 4000) presence(); }; source.onerror = () => { connected = false; skills.disconnect(); world?.clearTransient(); updateChoices(); updateInn(); $('#connection').classList.add('lost'); $('#connection').textContent = '서버 재연결 중…'; $('#server-status').textContent = 'RECONNECTING'; api('/api/auth/me').then(r => { if (!r.user) { disconnect(); user = null; showAuth(); } }).catch(() => {}); }; } catch (e) { toast(e.message); }
}
setInterval(() => { if (user) presence(); }, 4000);
addEventListener('pagehide', () => { if (user) fetch('/api/presence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, active: false }), keepalive: true }); });
addEventListener('pageshow', e => { if (e.persisted && user) connect(); });
// Auth UI is independent of game state; no game ownership comes from browser-provided ids.
const authDialog = document.createElement('dialog'); authDialog.id = 'auth-dialog';
authDialog.innerHTML = `<div class="welcome-art"></div><form id="auth-form"><p class="eyebrow">WELCOME TO ZWIEQUEST</p><h2 id="auth-title">이어서 떠나는 여행</h2><p class="auth-desc">나만의 모험을 안전하게 저장하세요.</p><div class="auth-tabs"><button type="button" id="tab-login" class="active">로그인</button><button type="button" id="tab-register">회원가입</button></div><label for="username">아이디</label><input id="username" name="username" autocomplete="username" required minlength="3" maxlength="24" pattern="[a-zA-Z0-9_]+" placeholder="영문·숫자·밑줄 3~24자"><label for="password">비밀번호</label><div class="password-field"><input id="password" name="password" type="password" inputmode="numeric" autocomplete="current-password" required minlength="6" maxlength="6" pattern="[0-9]{6}" aria-describedby="password-hint password-input-error"><div class="password-cells" aria-hidden="true">${Array.from({length:6}, () => '<span class="password-cell"></span>').join('')}</div></div><p id="password-hint">숫자 6자리 · 각 칸에 한 자리씩 입력하세요.</p><p id="password-input-error" role="status" aria-live="polite"></p><p id="auth-error" role="alert"></p><button id="auth-submit" class="primary" type="submit">로그인하고 여행 계속하기</button><p class="auth-note">이 서버의 계정으로 로그인합니다.<br>ChatGPT 계정 연동은 현재 제공되지 않습니다.</p></form>`;
document.body.append(authDialog);
const passwordInput = initPasswordInput($('#password'), $('#password-input-error'));
authDialog.addEventListener('cancel', e => e.preventDefault());
const logout = document.createElement('button'); logout.className = 'quiet'; logout.id = 'logout'; logout.textContent = '로그아웃'; logout.hidden = true; $('nav').insertBefore(logout, $('#help-button'));
const adminSettings = initAdminSettings({ api, getUser: () => user, getState: () => data?.state, onReset: result => { if (result.state) receive(result); } });
function showAuth() { adminSettings.setUser(null); if ($('#welcome').open) $('#welcome').close(); logout.hidden = true; if (!authDialog.open) authDialog.showModal(); }
function setAuthMode(mode) { passwordInput.clear(); authMode = mode; $('#tab-login').classList.toggle('active', mode === 'login'); $('#tab-register').classList.toggle('active', mode === 'register'); $('#auth-title').textContent = mode === 'login' ? '이어서 떠나는 여행' : '첫 여행을 시작해 볼까요?'; $('#auth-submit').textContent = mode === 'login' ? '로그인하고 여행 계속하기' : '계정 만들고 모험 시작하기'; $('#password').autocomplete = mode === 'login' ? 'current-password' : 'new-password'; $('#auth-error').textContent = ''; }
$('#tab-login').onclick = () => setAuthMode('login'); $('#tab-register').onclick = () => setAuthMode('register');
$('#auth-form').onsubmit = async e => {
  e.preventDefault(); if (!validPassword($('#password').value)) { $('#auth-error').textContent = '비밀번호는 숫자 6자리로 입력하세요.'; $('#password').focus(); return; } const button = $('#auth-submit'); button.disabled = true; $('#auth-error').textContent = '';
  try { const result = await api(`/api/auth/${authMode}`, { username: $('#username').value, password: $('#password').value }); user = result.user; adminSettings.setUser(user); passwordInput.clear(); authDialog.close(); logout.hidden = false; inventoryKey = ''; journalSeq = -1; journal.reset(); await connect(); }
  catch (error) { $('#auth-error').textContent = error.message; }
  finally { button.disabled = false; }
};
logout.onclick = async () => { try { await api('/api/auth/logout', {}); user = null; data = null; world?.update(null); disconnect(); showAuth(); } catch (e) { toast(e.message); } };
api('/api/auth/me').then(r => { user = r.user; adminSettings.setUser(user); if (user) { logout.hidden = false; connect(); } else showAuth(); }).catch(e => { toast(e.message); showAuth(); });
// Read-only diagnostics for local QA; contains no credentials or authoritative setters.
window.zwiequestDiagnostics = () => ({ render: world?.diagnostics(), phase: data?.state?.phase, eventSeq: data?.state?.eventSeq, connected });

const mapButton = document.createElement('button'); mapButton.id = 'map-button'; mapButton.className = 'quiet'; mapButton.textContent = '경로 지도'; $('nav').insertBefore(mapButton, $('#restore'));
const mapDialog = document.createElement('dialog'); mapDialog.id = 'map-dialog';
mapDialog.innerHTML = '<button class="dialog-close" aria-label="지도 닫기">×</button><p class="eyebrow">FORWARD, ALWAYS</p><h2 id="map-title">경로 지도</h2><p id="map-subtitle"></p><div class="map-toolbar"><span>탐험한 경로 · 갈림길 너머는 도착 후 공개</span><button id="map-root">시작점</button><button id="map-current">현재 위치</button><label>배율 <select id="map-scale"><option value="0.5">50%</option><option value="0.75">75%</option><option value="1" selected>100%</option><option value="1.25">125%</option></select></label></div><div id="map-graph" tabindex="0" aria-label="경로 지도 스크롤 영역"></div><p class="map-legend"><span class="current">● 현재 위치</span><span class="visited">● 탐험한 곳</span><span class="unknown">○ 미탐험 갈림길</span><span class="exit">◆ 연결 지역</span><span class="boss">● 보스</span></p>';
document.body.append(mapDialog);
const mapDeparture = document.createElement('div'); mapDeparture.className = 'map-departure';
mapDeparture.innerHTML = '<label>다음 출발 지역 <select id="map-start-region" aria-label="다음 출발 지역"></select></label><span>여관에서 출발할 때 적용됩니다.</span><button id="map-cancel-route">자동 이동 해제</button><span id="map-route-status" role="status"></span>';
mapDialog.insertBefore(mapDeparture, $('#map-graph'));
let mapRenderKey = '', mapStartPending = false, mapRoutePending = false;
function focusMapNode(id) {
  const graph = $('#map-graph'), node = [...graph.querySelectorAll('[data-node]')].find(n => n.dataset.node === id);
  if (!node) return;
  const bounds = graph.getBoundingClientRect(), target = node.getBoundingClientRect();
  graph.scrollLeft += target.x + target.width / 2 - bounds.x - graph.clientWidth / 2;
  graph.scrollTop += target.y + target.height / 2 - bounds.y - graph.clientHeight / 2;
}
mapDialog.querySelector('.dialog-close').onclick = () => mapDialog.close();
mapButton.onclick = () => { if (!data?.state) return toast('먼저 모험가를 선택하세요.'); renderMap(); mapDialog.showModal(); requestAnimationFrame(() => focusMapNode(mapViewState(data.state).currentNodeId)); };
$('#map-root').onclick = () => focusMapNode(data.state.mapGraph.rootId);
$('#map-current').onclick = () => focusMapNode(mapViewState(data.state).currentNodeId);
$('#map-scale').onchange = () => { renderMap(); focusMapNode(mapViewState(data.state).currentNodeId); };
$('#map-start-region').onchange = async event => {
  mapStartPending = true; event.target.disabled = true;
  try { await command('START_MAP', { mapId: event.target.value }); }
  finally { mapStartPending = false; renderMap(); }
};
$('#map-cancel-route').onclick = () => command('CANCEL_ROUTE', {}, $('#map-cancel-route'));
async function selectMapTarget(event) {
  const node = event.target.closest('.map-node.selectable');
  if (!node || mapRoutePending || !connected) return;
  mapRoutePending = true;
  try { await command('AUTO_ROUTE', { mapId: data.state.mapGraph.id, nodeId: node.dataset.node }); }
  finally { mapRoutePending = false; }
}
$('#map-graph').onclick = selectMapTarget;
$('#map-graph').onkeydown = event => {
  if (['Enter', ' '].includes(event.key) && event.target.closest('.map-node.selectable')) { event.preventDefault(); selectMapTarget(event); }
};
function renderMap() {
  if (!data?.state) return;
  const s = mapViewState(data.state), select = $('#map-start-region');
  const starts = s.availableStarts || [{ id: 'village', name: REGIONS.village.name }], options = JSON.stringify(starts);
  if (select.dataset.options !== options) { select.innerHTML = starts.map(map => `<option value="${esc(map.id)}">${esc(map.name)}</option>`).join(''); select.dataset.options = options; }
  if (!mapStartPending) select.value = s.departureMapId || 'village';
  select.disabled = !connected || mapStartPending;
  $('#map-cancel-route').disabled = !connected || !s.autoRoute;
  $('#map-route-status').textContent = s.autoRoute ? `자동 이동 중 · 목표 ${nodeLabels(s.mapGraph)[s.autoRoute.nodeId] || ''}` : '앞으로 이어지는 노드를 선택하면 자동 이동합니다.';
  const scale = Number($('#map-scale').value), key = JSON.stringify([s.mapGraph, s.currentNodeId, s.path, s.exploredNodes, s.checkpointHistory, s.autoRoute, s.phase, scale]);
  if (key === mapRenderKey) return; mapRenderKey = key;
  $('#map-title').textContent = `${s.mapGraph.name} · 깊이 ${s.step} / ${s.mapGraph.depth}`;
  $('#map-subtitle').textContent = '노드 표기: 깊이-번호 · 일반 경로 도착 시 전투 12.5% / 보물 12.5% / 통과 75%';
  const graph = $('#map-graph'), { scrollLeft, scrollTop } = graph;
  const previousCurrent = graph.querySelector('.map-node.current')?.dataset.node;
  graph.dataset.map = s.mapId; graph.innerHTML = mapSVG(s, scale, data.themes);
  graph.style.backgroundImage = `linear-gradient(#16333166,#11292888),url('${REGIONS[s.mapId].route}')`;
  graph.scrollLeft = scrollLeft; graph.scrollTop = scrollTop;
  if (mapDialog.open && previousCurrent !== s.currentNodeId) requestAnimationFrame(() => focusMapNode(s.currentNodeId));
}
