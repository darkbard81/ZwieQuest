import { APPEARANCES, appearanceFor, appearanceAssets, restRemaining } from './appearances.js';
import { sampleAnimationFrame } from './hero-animation.js';
import { innRoster } from './inn-roster.js';
const esc = text => String(text).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
export function initInn({ panel, portrait, countdown, onCommand }) {
  let state = null, receivedAt = 0, rate = 1, connected = false, pending = false, portraitKey = '', rosterKey = '', opening = false;
  let selectedAppearance = APPEARANCES[0].id, retireId = null, worldReady = false, departureKey = '', departurePending = false;
  const guestButtons = new Map();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  panel.innerHTML = '<div class="inn-heading"><strong>여행자의 여관</strong><span id="inn-status"></span></div><div class="inn-actions"><label class="inn-departure" for="inn-start-region">출발 지역 <select id="inn-start-region" aria-label="여관 출발 지역"></select></label><button id="inn-manage">캐릭터 관리</button></div>';
  const guestLayer = document.createElement('div'); guestLayer.id = 'inn-guests'; guestLayer.setAttribute('role', 'group'); guestLayer.setAttribute('aria-label', '캐릭터를 선택하여 출발'); guestLayer.hidden = true;
  panel.before(guestLayer);
  const dialog = document.createElement('dialog'); dialog.id = 'character-dialog'; dialog.setAttribute('aria-labelledby','character-dialog-title');
  dialog.innerHTML = `<button type="button" class="dialog-close" aria-label="캐릭터 관리 닫기">×</button><p class="eyebrow">TRAVELERS AT THE INN</p><h2 id="character-dialog-title">함께 떠날 모험가</h2><p class="muted">한 번의 모험에 한 명만 출전합니다. 관리 중에는 자동 출발을 멈춥니다.</p><div id="character-roster" class="character-roster"></div><form id="character-create"><h3>새 모험가 <small id="character-capacity"></small></h3><label for="character-name">이름</label><input id="character-name" name="name" required maxlength="20" autocomplete="off" placeholder="1~20자"><p class="muted">외형은 능력치에 영향을 주지 않습니다.</p><div class="appearance-list" role="group" aria-label="새 캐릭터 외형"></div><p>기본 능력치 0 · 자유 배분 10점<br>일반 단검 · 일반 로브 · 회복 스킬</p><button type="submit" class="primary" id="character-create-submit">캐릭터 생성</button></form><form id="character-retire" hidden><h3 id="character-retire-title"></h3><p>성장·스킬은 삭제됩니다. 공용 소지품·금화·지도는 보존됩니다.</p><label for="character-retire-name">확인을 위해 캐릭터 이름을 입력하세요</label><input id="character-retire-name" autocomplete="off"><button type="submit" class="danger">은퇴 확정</button><button type="button" id="character-retire-cancel">취소</button></form><p id="character-manager-status" role="status"></p><button type="button" id="character-manager-done">관리 완료</button>`;
  document.body.append(dialog);
  const $ = selector => dialog.querySelector(selector);
  const views = APPEARANCES.map(appearance => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'appearance-option'; button.dataset.appearance = appearance.id;
    button.innerHTML = `<span class="idle-preview" aria-hidden="true"></span><strong>${esc(appearance.name)}</strong>`;
    const preview = button.querySelector('.idle-preview'); preview.style.backgroundImage = `url('${appearanceAssets(appearance.id)}/sprite.png?v=${appearance.assetVersion}')`;
    const view = { appearance, button, preview, meta: null };
    button.onclick = () => { selectedAppearance = appearance.id; refresh(); };
    $('.appearance-list').append(button);
    fetch(`${appearanceAssets(appearance.id)}/sprite.json?v=${appearance.assetVersion}`).then(r => { if (!r.ok) throw Error('외형 불러오기 실패'); return r.json(); }).then(meta => { view.meta = meta; refresh(); }).catch(() => { button.title = '외형 미리보기를 불러오지 못했습니다.'; });
    return view;
  });
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
    try { if (await send('PAUSE_HOME')) { dialog.showModal(); $('#character-name').focus(); } }
    finally { opening = false; }
  }
  const close = () => { dialog.close(); retireId = null; $('#character-retire').hidden = true; };
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
      $('#character-name').value = ''; $('#character-manager-status').textContent = '생성 완료 · 관리 창을 닫고 모험의 창에서 캐릭터를 클릭하면 출발합니다.';
    }
  };
  $('#character-roster').onclick = async event => {
    const button = event.target.closest('button[data-character]'); if (!button || !canManage()) return;
    const c = state.characters.find(c => c.id === button.dataset.character); if (!c) return;
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
    if (!view?.meta || !size || portrait.hidden) return;
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
    panel.querySelector('#inn-status').textContent = count ? '모험가를 클릭하거나 터치하면 출발합니다' : '첫 캐릭터를 생성해 주세요';
    panel.querySelector('#inn-manage').disabled = !canManage();
    const starts = state?.availableStarts || [], nextDepartureKey = JSON.stringify(starts);
    if (nextDepartureKey !== departureKey) {
      departureKey = nextDepartureKey;
      departure.innerHTML = starts.map(start => `<option value="${esc(start.id)}">${esc(start.name)}</option>`).join('');
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
    for (const view of views) { view.button.disabled = !canManage() || count >= 3; view.button.setAttribute('aria-pressed', String(view.appearance.id === selectedAppearance)); }
    $('#character-create-submit').disabled = !canManage() || count >= 3;
    $('#character-name').disabled = !canManage() || count >= 3;
    $('#character-capacity').textContent = `(${count}/3명)`;
    $('#character-retire button[type=submit]').disabled = !canManage();
    const key = JSON.stringify([state?.characters.map(c=>[c.id,c.name,c.appearanceId,c.level,c.xp,c.hp,c.maxHp,c.attributePoints]), state?.activeCharacterId, canManage()]);
    if (key !== rosterKey) {
      $('#character-roster').innerHTML = count ? state.characters.map(c => `<article class="character-card${c.id === state.activeCharacterId ? ' selected' : ''}"><div><strong>${esc(c.name)}</strong><small>${esc(appearanceFor(c).name)} · Lv.${c.level} · HP ${c.hp}/${c.maxHp} · 미사용 ${c.attributePoints}점</small></div><div><button type="button" class="danger" data-action="retire" data-character="${esc(c.id)}" ${!canManage() ? 'disabled' : ''}>은퇴</button></div></article>`).join('') : '<p class="muted">아직 캐릭터가 없습니다. 아래에서 첫 모험가를 생성하세요.</p>';
      rosterKey = key;
    }
    refreshPortrait();
  }
  new ResizeObserver(refreshPortrait).observe(portrait);
  function frame(now) {
    requestAnimationFrame(frame); if (document.hidden) return;
    if (!panel.hidden) countdown.textContent = !connected ? '연결 대기' : !state.activeCharacterId ? '캐릭터 생성 대기' : state.homePaused ? '자동 출발 일시정지' : `출발까지 ${Math.ceil(remaining()/1000)}초`;
    if (dialog.open) for (const {meta,preview} of views) if (meta) {
      const f = meta.frames[meta.animations.Front_Idle.frameNames[sampleAnimationFrame('Front_Idle',now,reduced)]].frame, size = 64, scale = size/meta.frameWidth;
      preview.style.backgroundSize = `${meta.columns*size}px ${meta.rows*size}px`; preview.style.backgroundPosition = `${-f.x*scale}px ${-f.y*scale}px`;
    }
  }
  requestAnimationFrame(frame);
  return { setWorldReady() { worldReady = true; refresh(); }, update(next, at, speed, online) { state=next; receivedAt=at; rate=speed; connected=online; refresh(); }, focus:open };
}
