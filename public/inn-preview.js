import { appearanceAssets, mirrorAppearance } from './appearances.js';
import { PLAYBACK, sampleAnimationFrame } from './hero-animation.js';

export const PREVIEW_ACTIONS = [
  ['Front_Idle', '대기'], ['Front_Victory', '승리'], ['Side_Walk', '걷기'],
  ['Side_Attack', '공격'], ['Side_Hit', '피격'], ['Side_Down', '쓰러짐']
];
// A separate clock keeps previews from changing game state or real combat timing.
export function createPreviewClock() {
  let action = 'Front_Idle', elapsed = 0, speed = 1, repeat = false, tour = false, playing = true;
  return {
    get action() { return action; }, get playing() { return playing; }, get tour() { return tour; },
    select(value) { action = value; elapsed = 0; tour = false; playing = true; },
    restart() { elapsed = 0; playing = true; },
    setSpeed(value) { speed = value === .5 ? .5 : 1; },
    setRepeat(value) { repeat = Boolean(value); },
    toggle() { playing = !playing; },
    startTour() { action = 'Front_Idle'; elapsed = 0; tour = true; playing = true; },
    tick(delta, reduced = false) {
      if (playing) elapsed += Math.max(0, delta) * speed;
      const spec = PLAYBACK[action];
      if (tour && elapsed >= spec.duration + 600) {
        action = PREVIEW_ACTIONS[(PREVIEW_ACTIONS.findIndex(([id]) => id === action) + 1) % PREVIEW_ACTIONS.length][0]; elapsed = 0;
      } else if (!tour && repeat && !spec.loop && elapsed >= spec.duration + 600) elapsed = 0;
      return { action, frame: sampleAnimationFrame(action, elapsed, reduced), elapsed };
    }
  };
}

export function initInnPreview(root) {
  root.innerHTML = `<h3 id="inn-preview-name">모험가 미리보기</h3><div class="inn-preview-stage"><canvas width="512" height="512" aria-label="선택한 캐릭터 동작"></canvas></div><p class="inn-preview-status" role="status"></p><div class="inn-motion-actions" role="group" aria-label="미리보기 동작">${PREVIEW_ACTIONS.map(([id, label]) => `<button type="button" data-motion="${id}" aria-pressed="${id === 'Front_Idle'}">${label}</button>`).join('')}</div><div class="inn-motion-tools"><button type="button" data-tool="restart">다시 재생</button><button type="button" data-tool="pause">일시 정지</button><button type="button" data-tool="tour" aria-pressed="false">전체 동작 보기</button><label>속도 <select aria-label="동작 재생 속도"><option value="1">1배속</option><option value="0.5">0.5배속</option></select></label><label class="inn-repeat"><input type="checkbox">단발 동작 반복</label></div>`;
  const canvas = root.querySelector('canvas'), ctx = canvas.getContext('2d'), status = root.querySelector('[role=status]');
  const clock = createPreviewClock(), metadata = new Map();
  let current = null, meta = null, image = null, requested = '', token = 0, last = 0, active = false, lastFrame = '';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let explicitPlayback = false;
  const updateButtons = () => {
    for (const button of root.querySelectorAll('[data-motion]')) button.setAttribute('aria-pressed', String(button.dataset.motion === clock.action));
    root.querySelector('[data-tool=tour]').setAttribute('aria-pressed', String(clock.tour));
    root.querySelector('[data-tool=pause]').textContent = clock.playing ? '일시 정지' : '재생';
  };
  function load() {
    if (!active || !current) return;
    const key = `${current.id}:${clock.action}`;
    if (key === requested) return;
    requested = key; const request = ++token, appearance = current, action = clock.action;
    image = null; meta = null; lastFrame = ''; ctx.clearRect(0, 0, 512, 512); status.textContent = '동작 불러오는 중…';
    if (!metadata.has(appearance.id)) metadata.set(appearance.id, fetch(`${appearanceAssets(appearance.id)}/sprite.json?v=${appearance.assetVersion}`).then(r => { if (!r.ok) throw Error('metadata'); return r.json(); }).catch(error => { metadata.delete(appearance.id); throw error; }));
    metadata.get(appearance.id).then(async value => {
      if (request !== token) return;
      const sheet = new Image(); sheet.src = `${appearanceAssets(appearance.id)}/${value.animations[action].sheet}?v=${appearance.assetVersion}`;
      await sheet.decode();
      if (request !== token) return;
      meta = value; image = sheet; clock.restart(); last = performance.now();
      status.textContent = `${PREVIEW_ACTIONS.find(([id]) => id === action)[1]} · ${reduced.matches && !explicitPlayback ? '동작 줄이기 설정 · 재생을 눌러 확인' : '게임과 같은 기본 재생 속도'}`;
    }).catch(() => { if (request === token) { requested = ''; status.textContent = '동작을 불러오지 못했습니다. 다시 재생을 눌러 주세요.'; } });
  }
  root.onclick = event => {
    const button = event.target.closest('button'); if (!button) return;
    explicitPlayback = true;
    if (button.dataset.motion) clock.select(button.dataset.motion);
    if (button.dataset.tool === 'restart') clock.restart();
    if (button.dataset.tool === 'pause') clock.toggle();
    if (button.dataset.tool === 'tour') clock.startTour();
    lastFrame = ''; updateButtons(); load();
  };
  root.querySelector('select').onchange = event => clock.setSpeed(Number(event.target.value));
  root.querySelector('input').onchange = event => clock.setRepeat(event.target.checked);
  return {
    show(appearance, name, visible) {
      const changed = current?.id !== appearance?.id;
      active = visible; current = appearance;
      root.querySelector('h3').textContent = name || appearance?.name || '모험가 미리보기';
      if (!active || !current) { token++; requested = ''; image = null; meta = null; last = 0; ctx.clearRect(0, 0, 512, 512); return; }
      if (changed) { clock.restart(); requested = ''; lastFrame = ''; }
      load(); updateButtons();
    },
    frame(now) {
      if (!active || document.hidden) { last = 0; return; }
      const delta = last ? Math.min(now - last, 100) : 0; last = now;
      if (!image || !meta) return;
      const motion = clock.tick(delta, reduced.matches && !explicitPlayback);
      if (`${current.id}:${motion.action}` !== requested) { updateButtons(); load(); return; }
      const key = `${requested}:${motion.frame}`; if (key === lastFrame) return; lastFrame = key;
      const f = meta.frames[meta.animations[motion.action].frameNames[motion.frame]].frame;
      ctx.clearRect(0, 0, 512, 512); ctx.save();
      if (mirrorAppearance(meta, { action: motion.action, mirrored: false })) { ctx.translate(512, 0); ctx.scale(-1, 1); }
      ctx.drawImage(image, f.x, f.y, f.w, f.h, 0, 0, 512, 512); ctx.restore();
    }
  };
}
