import { initJournal } from './journal-view.js';
import { initDefenseDetails } from './defense-details.js';
import { initInn } from './inn-view.js';
import { appearanceFor } from './appearances.js';
import { tacticDescription, roundStatus } from './tactics-view.js';
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
  try { receive(await api('/api/command', { type, ...fields, requestId: crypto.randomUUID() })); }
  catch (e) { toast(e.message); }
  finally { button?.classList.remove('busy'); }
}
function receive(next) {
  const combatEvents = combatFeed.consume(next, connected);
  data = next; receivedAt = performance.now(); connected = true;
  $('#connection').classList.remove('lost'); $('#connection').innerHTML = `<i></i>${next.mode === 'ONLINE' ? '온라인' : '오프라인'} · ${next.rate}×`;
  $('#server-status').textContent = 'SERVER LIVE · SAVED';
  updateInn();
  const s = next.state; $('#world').dataset.phase = s?.phase || 'HOME'; updateChoices();
  if (!s) { world?.update(null); if (user && !user.isAdmin && !$('#welcome').open) $('#welcome').showModal(); return; }
  if ($('#welcome').open) $('#welcome').close(); world?.update(s); world?.playEvents(combatEvents);
  const theme = next.themes.find(t => t.id === s.theme);
  $('#biome-tag').textContent = s.phase === 'HOME' ? 'PUB / REST' : s.theme.toUpperCase();
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
  const tacticOptions = s.availableTactics || [{ id: 'normal', name: '일반' }];
  const optionKey = tacticOptions.map(t => t.id).join(',');
  if ($('#tactic').dataset.options !== optionKey) {
    $('#tactic').innerHTML = tacticOptions.map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('');
    $('#tactic').dataset.options = optionKey;
  }
  $('#tactic').value = s.tactic;
  $('#tactic-summary').textContent = tacticDescription(tacticOptions.find(t => t.id === s.tactic));
  $('#battle-status').textContent = roundStatus(s);
  $('#enemy-hud').hidden = !s.enemy || s.phase !== 'BATTLE';
  if (s.enemy) $('#enemy-hud').innerHTML = `${esc(s.enemy.name)} · ${s.enemy.hp}/${s.enemy.maxHp}<div class="meter"><div style="width:${100 * s.enemy.hp / s.enemy.maxHp}%"></div></div>`;
  $('#scene-notice').textContent = s.phase === 'TREASURE' ? (s.lastReward?.itemName ? `${s.lastReward.itemName} 획득!` : '전투 보상으로 경험치와 금화를 얻었어요.') : s.phase === 'DOWNED' ? '괜찮아요. 여관에서 다시 시작하면 돼요.' : '';
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
  const key = JSON.stringify([s.inventory, s.equipment, s.equipmentUsers, s.classId, filter]); if (key === inventoryKey) return; inventoryKey = key;
  $('#item-count').textContent = `${s.inventory.length}개`;
  const items = s.inventory.filter(i => filter === 'all' || i.slot === filter).slice().reverse();
  $('#inventory-list').innerHTML = items.length ? items.map(item => {
    const equipped = Object.values(s.equipment).includes(item.id);
    const users = s.equipmentUsers?.[item.id] || (equipped ? [s.classId] : []);
    const names = users.map(id => s.classProfiles?.[id]?.name || id).join('·');
    return `<article class="item ${!item.gradeId && item.tier >= 2 ? 'rare' : ''}" data-grade="${esc(item.gradeId || 'legacy')}"><div class="item-icon">${itemIconHTML(item)}</div><div><h3>${esc(item.name)}${users.length ? `<span class="equipped">${esc(names)} 장착</span>` : ''}</h3><p>${itemDetailsHTML(item)}</p><div class="item-actions"><span class="rarity">${esc(item.rarity)}${item.special ? ' · 특수' : ''}</span><button data-action="${equipped ? 'UNEQUIP' : 'EQUIP'}" data-item="${item.id}">${equipped ? '해제' : '장착'}</button><button class="sell" data-action="SELL" data-item="${item.id}" ${users.length ? `disabled title="${esc(names)} 직업에서 장착을 해제해 주세요"` : ''}>판매 ${item.value} G</button></div></div></article>`;
  }).join('') : '<p class="muted">아직 발견한 장비가 없어요. 여행을 조금 더 지켜보세요.</p>';
}
$('#inventory-list').addEventListener('click', e => { const b = e.target.closest('[data-action]'); if (b) command(b.dataset.action, { itemId: b.dataset.item }, b); });
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
$('#tactic').onchange = e => command('TACTIC', { tactic: e.target.value });
$('#class-switch').onclick = () => { const w = $('#world-window'); if (w.classList.contains('collapsed')) w.querySelector('.minimize').click(); inn.focus(); };
$$('[data-class]').forEach(b => b.onclick = () => command('CREATE', { classId: b.dataset.class }, b));
$('#welcome').addEventListener('cancel', e => e.preventDefault());
$('#help-button').onclick = () => $('#help').showModal(); $$('#help .dialog-close').forEach(b => b.onclick = () => $('#help').close());
async function presence(active = true) { if (!user) return; if (active) lastHeartbeat = Date.now(); try { await api('/api/presence', { clientId, active }); } catch (e) { if (active) $('#connection').classList.add('lost'); } }
function disconnect() { source?.close(); source = null; connected = false; world?.clearTransient(); updateChoices(); updateInn(); $('#connection').classList.add('lost'); $('#connection').textContent = '연결 대기'; }
async function connect() {
  disconnect();
  try { receive(await api('/api/state')); await presence(); source = new EventSource('/api/events?clientId=' + clientId); source.onmessage = e => { receive(JSON.parse(e.data)); if (Date.now() - lastHeartbeat > 4000) presence(); }; source.onerror = () => { connected = false; world?.clearTransient(); updateChoices(); updateInn(); $('#connection').classList.add('lost'); $('#connection').textContent = '서버 재연결 중…'; $('#server-status').textContent = 'RECONNECTING'; api('/api/auth/me').then(r => { if (!r.user) { disconnect(); user = null; showAuth(); } }).catch(() => {}); }; } catch (e) { toast(e.message); }
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
const adminSettings = initAdminSettings({ api, getUser: () => user });
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
const mapDialog = document.createElement('dialog'); mapDialog.id = 'map-dialog'; mapDialog.innerHTML = '<button class="dialog-close" aria-label="지도 닫기">×</button><p class="eyebrow">FORWARD, ALWAYS</p><h2 id="map-title">경로 지도</h2><p id="map-subtitle"></p><div id="map-graph"></div><p class="map-legend">● 현재 위치　● 지나온 길　· 양쪽 경로는 항상 다음 깊이로 이어집니다.</p>'; document.body.append(mapDialog);
mapDialog.querySelector('.dialog-close').onclick = () => mapDialog.close(); mapButton.onclick = () => { if (!data?.state) return toast('먼저 모험가를 선택하세요.'); renderMap(); mapDialog.showModal(); };
function renderMap() {
 const s = data?.state; if (!s) return; const map = s.mapGraph, nodes = Object.values(map.nodes), pos = {}, visited = new Set(s.path.flatMap(p => [p.from, p.to]));
 $('#map-title').textContent = map.name + ' · 깊이 ' + s.step + ' / 10'; $('#map-subtitle').textContent = '체크포인트 통과 기록: ' + (s.checkpointHistory.map(c => data.themes.find(t => t.id === c.mapId).name).join(', ') || '아직 없음') + ' · 기록은 이동이나 귀환에 사용되지 않습니다. · 마지막 지점 ' + map.terminalIds.length + '곳';
 for(let d=0; d<=10; d++) { const layer = nodes.filter(n=>n.depth===d); layer.forEach((n,i)=>pos[n.id]={x:28+d*76,y:30+(i+.5)*480/layer.length}); }
 let svg='<svg viewBox="0 0 1060 540" role="img" aria-label="깊이 10의 전진 경로 지도">';
 for(const n of nodes) for(const target of Object.values(n.edges||{})) { const a=pos[n.id],b=pos[target];svg+=`<path d="M${a.x},${a.y} L${b.x},${b.y}" stroke="#486457" stroke-width="1" fill="none"/>`; }
 for(const n of nodes) { const p=pos[n.id],color=n.id===s.currentNodeId?'#efcf80':visited.has(n.id)?'#acdbab':n.kind==='exit'?'#b6a4e2':n.kind==='boss'?'#ea9a87':'#6b9481';svg+=`<g><title>${esc(n.label)}</title><circle cx="${p.x}" cy="${p.y}" r="${n.id===s.currentNodeId?7:4}" fill="${color}"/>${n.depth===10?`<text x="${p.x+12}" y="${p.y+4}" fill="${color}" font-size="11">${esc(n.label)}</text>`:''}</g>`; }
 for(let d=0;d<=10;d++)svg+=`<text x="${28+d*76}" y="530" fill="#9eb7a6" font-size="10">${d}</text>`; $('#map-graph').innerHTML=svg+'</svg>';
}
