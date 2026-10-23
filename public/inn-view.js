import { prepareModalScroll } from './modal-layout.js';
import { APPEARANCES, appearanceFor, appearanceAssets, restRemaining } from './appearances.js';
import { initInnPreview } from './inn-preview.js';
import { innRoster } from './inn-roster.js';
const esc = text => String(text).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
export function initInn({ panel, portrait, countdown, onCommand }) {
  let state = null, receivedAt = 0, rate = 1, connected = false, pending = false, portraitKey = '', rosterKey = '', opening = false;
  let selectedAppearance = APPEARANCES[0].id, retireId = null, worldReady = false, departureKey = '', departurePending = false;
  const guestButtons = new Map();
  let mode = 'roster', previewCharacterId = null;
  let preview;
  panel.innerHTML = '<div class="inn-actions"><label class="inn-departure" for="inn-start-region">출발 지역 <select id="inn-start-region" aria-label="여관 출발 지역"></select></label><button id="inn-manage">캐릭터 관리</button></div>';
  const guestLayer = document.createElement('div'); guestLayer.id = 'inn-guests'; guestLayer.setAttribute('role', 'group'); guestLayer.setAttribute('aria-label', '캐릭터를 선택하여 출발'); guestLayer.hidden = true;
  panel.before(guestLayer);
  const dialog = document.createElement('dialog'); dialog.id = 'character-dialog'; dialog.setAttribute('aria-labelledby','character-dialog-title');
  dialog.innerHTML = `<button type="button" class="dialog-close" aria-label="캐릭터 관리 닫기">×</button><p class="eyebrow">TRAVELERS AT THE INN</p><h2 id="character-dialog-title">함께 떠날 모험가</h2><p class="muted">동작을 살펴보고 모험가를 선택하세요. 관리 중에는 자동 출발을 멈춥니다.</p><div class="inn-manager-tabs" role="group" aria-label="캐릭터 관리 화면"><button type="button" data-mode="roster" aria-pressed="true">내 캐릭터</button><button type="button" data-mode="create" aria-pressed="false">새 캐릭터</button></div><div class="inn-manager-layout"><section class="inn-preview" aria-label="캐릭터 동작 미리보기"></section><section class="inn-manager-details"><div id="character-owned"><div id="character-roster" class="character-roster"></div><button type="button" id="character-select" class="primary">출전 캐릭터로 선택</button><button type="button" id="character-retire-open" class="tiny danger">선택한 캐릭터 은퇴</button></div><form id="character-create" hidden><h3>새 모험가 <small id="character-capacity"></small></h3><p class="muted">외형은 능력치에 영향을 주지 않습니다.</p><div class="appearance-list" role="group" aria-label="새 캐릭터 외형"></div><label for="character-name">이름</label><input id="character-name" name="name" required maxlength="20" autocomplete="off" placeholder="1~20자"><p>기본 능력치 0 · 자유 배분 10점<br>일반 단검 · 일반 로브 · 회복 스킬</p><button type="submit" class="primary" id="character-create-submit">캐릭터 생성</button></form><form id="character-retire" hidden><h3 id="character-retire-title"></h3><p>성장·캐릭터별 스킬 설정은 삭제됩니다. 공용 스킬·소지품·금화·지도는 보존됩니다.</p><label for="character-retire-name">확인을 위해 캐릭터 이름을 입력하세요</label><input id="character-retire-name" autocomplete="off"><button type="submit" class="danger">은퇴 확정</button><button type="button" id="character-retire-cancel">취소</button></form></section></div><p id="character-manager-status" role="status"></p><button type="button" id="character-manager-done">관리 완료</button>`;
  prepareModalScroll(dialog);
  document.body.append(dialog);
  const $ = selector => dialog.querySelector(selector);
  preview = initInnPreview($('.inn-preview'));
  const views = APPEARANCES.map(appearance => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'appearance-option'; button.dataset.appearance = appearance.id;
    button.innerHTML = `<img src="/portraits/${appearance.id}.png?v=${appearance.assetVersion}" alt="" width="56" height="56" loading="lazy"><strong>${esc(appearance.name)}</strong>`;
    button.onclick = () => { selectedAppearance = appearance.id; refresh(); };
    $('.appearance-list').append(button);
    return { appearance, button };
  });
  for (const button of dialog.querySelectorAll('[data-mode]')) button.onclick = () => {
    mode = button.dataset.mode; retireId = null; $('#character-retire').hidden = true; refresh();
  };
  const canManage = () => connected && state?.phase === 'HOME' && !pending;
  const remaining = () => restRemaining(state, receivedAt, performance.now(), rate);
  async function send(type, fields = {}) {
    if (!canManage()) return false;
    pending = true; refresh();
    try { return await onCommand(type, fields); }
    finally { pending = false; refresh(); }
  }
  async function open() {
    if (!canManage() || opening) return;
    opening = true;
    try { if (await send('PAUSE_HOME')) { mode = state.characters.length ? 'roster' : 'create'; previewCharacterId = state.activeCharacterId; dialog.showModal(); refresh(); dialog.querySelector(`[data-mode="${mode}"]`).focus(); } }
    finally { opening = false; }
  }
  const close = () => { dialog.close(); retireId = null; $('#character-retire').hidden = true; preview.show(null, '', false); };
  dialog.querySelector('.dialog-close').onclick = close; $('#character-manager-done').onclick = close;
  dialog.addEventListener('cancel', e => { e.preventDefault(); close(); });
  panel.querySelector('#inn-manage').onclick = open;
  const departure = panel.querySelector('#inn-start-region');
  departure.onchange = async () => {
    const mapId = departure.value;
    if (!canManage() || mapId === state.departureMapId) return;
    departurePending = true;
    try { await send('START_MAP', { mapId }); }
    finally { departurePending = false; refresh(); }
  };
  guestLayer.onclick = async event => {
    const button = event.target.closest('button[data-character]');
    if (!button || !canManage() || !worldReady || dialog.open) return;
    const characterId = button.dataset.character;
    pending = true; refresh();
    try {
      // Keep both requests under one input lock. DEPART rejects a selection changed by another tab.
      if (await onCommand('SELECT_CHARACTER', { characterId })) await onCommand('DEPART', { characterId });
    } finally { pending = false; refresh(); }
  };
  $('#character-create').onsubmit = async event => {
    event.preventDefault();
    if (await send('CREATE_CHARACTER', { name: $('#character-name').value, appearanceId: selectedAppearance })) {
      $('#character-name').value = ''; mode = 'roster'; previewCharacterId = state.characters.at(-1)?.id; refresh(); $('#character-manager-status').textContent = '생성 완료 · 관리 창을 닫고 모험의 창에서 캐릭터를 클릭하면 출발합니다.';
    }
  };
  $('#character-roster').onclick = event => {
    const button = event.target.closest('button[data-character]'); if (!button) return;
    previewCharacterId = button.dataset.character; retireId = null; $('#character-retire').hidden = true; refresh();
  };
  $('#character-select').onclick = async () => {
    if (await send('SELECT_CHARACTER', { characterId: previewCharacterId })) {
      await send('PAUSE_HOME');
      $('#character-manager-status').textContent = '출전 캐릭터를 선택했습니다. 관리 완료 후 여관에서 캐릭터를 눌러 출발하세요.';
    }
  };
  $('#character-retire-open').onclick = () => {
    if (!canManage()) return;
    const c = state.characters.find(c => c.id === previewCharacterId); if (!c) return;
    retireId = c.id; $('#character-retire-title').textContent = `${c.name} 은퇴`; $('#character-retire-name').value = ''; $('#character-retire').hidden = false; $('#character-retire-name').focus();
  };
  $('#character-retire-cancel').onclick = () => { retireId = null; $('#character-retire').hidden = true; };
  $('#character-retire').onsubmit = async event => {
    event.preventDefault();
    if (await send('RETIRE_CHARACTER', { characterId: retireId, confirmName: $('#character-retire-name').value })) { retireId = null; $('#character-retire').hidden = true; }
  };
  function refreshPortrait() {
    portrait.hidden = !state?.activeCharacterId;
    const view = views.find(v => v.appearance.id === appearanceFor(state).id), size = portrait.clientWidth;
    if (!view || !size || portrait.hidden) return;
    const key = `${view.appearance.id}:${size}:${state.name}`; if (key === portraitKey) return;
    // A pre-cropped portrait avoids a second full-atlas decode and browser cache contention.
    portrait.style.backgroundImage = `url('/portraits/${view.appearance.id}.png?v=${view.appearance.assetVersion}')`;
    portrait.style.backgroundSize = `${size}px ${size}px`;
    portrait.style.backgroundPosition = '0 0';
    portrait.dataset.appearance = view.appearance.id; portrait.setAttribute('role','img'); portrait.setAttribute('aria-label',`${state.name} 초상화`); portraitKey = key;
  }
  function refresh() {
    panel.hidden = !state || state.phase !== 'HOME'; countdown.hidden = panel.hidden;
    if (panel.hidden && dialog.open) close();
    const count = state?.characters.length || 0;
    panel.querySelector('#inn-manage').disabled = !canManage();
    const starts = state?.availableStarts || [], nextDepartureKey = JSON.stringify(starts);
    if (nextDepartureKey !== departureKey) {
      departureKey = nextDepartureKey;
      departure.innerHTML = starts.map(start => `<option value="${esc(start.id)}">${esc(start.label || start.name)}</option>`).join('');
    }
    if (!departurePending) departure.value = state?.departureMapId || 'village';
    departure.disabled = !canManage() || !starts.length;
    guestLayer.hidden = panel.hidden;
    const guests = innRoster(state?.characters);
    const ids = new Set(guests.map(c => c.id));
    for (const [id, button] of guestButtons) if (!ids.has(id)) { button.remove(); guestButtons.delete(id); }
    for (const c of guests) {
      let button = guestButtons.get(c.id);
      if (!button) {
        button = document.createElement('button'); button.type = 'button'; button.className = 'inn-guest'; button.dataset.character = c.id;
        const label = document.createElement('span'); label.className = 'inn-guest-name'; button.append(label);
        guestButtons.set(c.id, button); guestLayer.append(button);
      }
      button.style.left = `${c.x - c.targetWidth / 2}px`; button.style.top = `${c.targetTop}px`;
      button.style.width = `${c.targetWidth}px`; button.style.height = `${c.targetHeight}px`;
      button.disabled = !canManage() || !worldReady;
      button.setAttribute('aria-label', `${c.name} · 레벨 ${c.level} · 선택하여 출발`);
      button.title = `${c.name} 선택하여 출발`;
      button.firstChild.textContent = `${c.name} · Lv.${c.level}`;
    }
    for (const view of views) { view.button.disabled = false; view.button.setAttribute('aria-pressed', String(view.appearance.id === selectedAppearance)); }
    $('#character-create-submit').disabled = !canManage() || count >= 3;
    $('#character-name').disabled = !canManage() || count >= 3;
    $('#character-capacity').textContent = `(${count}/3명)`;
    $('#character-retire button[type=submit]').disabled = !canManage();
    if (!state?.characters.some(c => c.id === previewCharacterId)) previewCharacterId = state?.activeCharacterId || state?.characters[0]?.id || null;
    const selected = state?.characters.find(c => c.id === previewCharacterId);
    const key = JSON.stringify([state?.characters.map(c=>[c.id,c.name,c.appearanceId,c.level,c.xp,c.hp,c.maxHp,c.attributePoints]), state?.activeCharacterId, previewCharacterId]);
    if (key !== rosterKey) {
      $('#character-roster').innerHTML = count ? state.characters.map(c => `<button type="button" class="character-card${c.id === previewCharacterId ? ' selected' : ''}" data-character="${esc(c.id)}" aria-pressed="${c.id === previewCharacterId}"><img src="/portraits/${c.appearanceId}.png" alt="" width="48" height="48"><span><strong>${esc(c.name)}${c.id === state.activeCharacterId ? ' · 출전 선택됨' : ''}</strong><small>${esc(appearanceFor(c).name)} · Lv.${c.level} · HP ${c.hp}/${c.maxHp} · 미사용 ${c.attributePoints}점</small></span></button>`).join('') : '<p class="muted">아직 캐릭터가 없습니다. 새 캐릭터 탭에서 첫 모험가를 만나세요.</p>';
      rosterKey = key;
    }
    $('#character-owned').hidden = mode !== 'roster'; $('#character-create').hidden = mode !== 'create';
    for (const button of dialog.querySelectorAll('[data-mode]')) button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
    $('#character-select').disabled = !canManage() || !selected || selected.id === state?.activeCharacterId;
    $('#character-retire-open').disabled = !canManage() || !selected;
    const shown = mode === 'create' ? APPEARANCES.find(a => a.id === selectedAppearance) : selected && appearanceFor(selected);
    preview.show(shown, mode === 'create' ? shown?.name : selected?.name, dialog.open);
    refreshPortrait();
  }
  new ResizeObserver(refreshPortrait).observe(portrait);
  function frame(now) {
    requestAnimationFrame(frame); if (document.hidden) return;
    if (!panel.hidden) countdown.textContent = !connected ? '연결 대기' : !state.activeCharacterId ? '캐릭터 생성 대기' : state.homePaused ? '자동 출발 일시정지' : `출발까지 ${Math.ceil(remaining()/1000)}초`;
    preview.frame(now);
  }
  requestAnimationFrame(frame);
  return { setWorldReady() { worldReady = true; refresh(); }, update(next, at, speed, online) { state=next; receivedAt=at; rate=speed; connected=online; refresh(); }, focus:open };
}
