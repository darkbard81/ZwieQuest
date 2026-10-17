import { APPEARANCES, appearanceFor, appearanceAssets, restRemaining } from './appearances.js';
import { sampleAnimationFrame } from './hero-animation.js';

// One square upper-body crop, shared by all 256px character cells.
const PORTRAIT_CROP = { x: 56, y: 24, size: 144 };

export function initInn({ panel, portrait, countdown, onSelect }) {
  let state = null, receivedAt = 0, rate = 1, connected = false, pending = false;
  let portraitKey = '';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const views = APPEARANCES.map(appearance => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'appearance-option';
    button.dataset.appearance = appearance.id;
    button.setAttribute('aria-label', `${appearance.name} · ${appearance.classId === 'wizard' ? '마법사' : '전사'} 직업`);
    button.innerHTML = `<span class="idle-preview" aria-hidden="true"></span><strong>${appearance.name}</strong><small>${appearance.classId === 'wizard' ? '마법사' : '전사'} 직업</small>`;
    const preview = button.querySelector('.idle-preview');
    preview.style.backgroundImage = `url('${appearanceAssets(appearance.id)}/sprite.png?v=${appearance.assetVersion || 'inn-1'}')`;
    const view = { appearance, button, preview, meta: null };
    button.disabled = true;
    button.onclick = async () => {
      if (!canSelect()) return;
      pending = true; refresh();
      try { await onSelect(appearance.id, button); }
      finally { pending = false; refresh(); }
    };
    panel.querySelector('.appearance-list').append(button);
    fetch(`${appearanceAssets(appearance.id)}/sprite.json?v=${appearance.assetVersion || 'inn-1'}`).then(r => {
      if (!r.ok) throw Error('외형을 불러오지 못했습니다.');
      return r.json();
    }).then(meta => { view.meta = meta; refresh(); }).catch(() => { button.title = '새로고침하여 외형을 다시 불러오세요.'; });
    return view;
  });
  const remaining = () => restRemaining(state, receivedAt, performance.now(), rate);
  const canSelect = () => connected && !pending && state?.phase === 'HOME' && remaining() > 0;
  function refresh() {
    panel.hidden = !state || state.phase !== 'HOME';
    countdown.hidden = panel.hidden;
    const selected = appearanceFor(state).id;
    for (const { appearance, button, meta } of views) {
      button.disabled = !canSelect() || !meta;
      button.setAttribute('aria-pressed', String(appearance.id === selected));
      const profile = state?.classProfiles?.[appearance.classId];
      if (profile) {
        const label = `${profile.name} Lv.${profile.level}`;
        const small = button.querySelector('small');
        if (small.textContent !== label) small.textContent = label;
        if (meta) button.title = profile.started ? `${profile.name}의 저장된 성장·장비·전술을 사용합니다.` : '새 직업: 1레벨 · 경험치 0 · 장비 미착용 · 일반 전술';
      }
    }
    refreshPortrait();
  }
  function refreshPortrait() {
    const view = views.find(v => v.appearance.id === appearanceFor(state).id);
    const size = portrait.clientWidth;
    if (!view?.meta || !size) return;
    const key = `${view.appearance.id}:${size}:${view.appearance.assetVersion || 'inn-1'}`;
    if (key === portraitKey) return;
    const meta = view.meta, crop = PORTRAIT_CROP;
    const f = meta.frames[meta.animations.Front_Idle.frameNames[0]].frame;
    const scale = size / crop.size;
    portrait.style.backgroundImage = view.preview.style.backgroundImage;
    portrait.style.backgroundSize = `${meta.columns * meta.frameWidth * scale}px ${meta.rows * meta.frameHeight * scale}px`;
    portrait.style.backgroundPosition = `${-(f.x + crop.x) * scale}px ${-(f.y + crop.y) * scale}px`;
    portrait.dataset.frame = '0';
    portrait.dataset.appearance = view.appearance.id;
    portrait.setAttribute('role', 'img');
    portrait.setAttribute('aria-label', `${view.appearance.name} 상반신 초상화`);
    portraitKey = key;
  }
  new ResizeObserver(refreshPortrait).observe(portrait);
  function draw(element, meta, now, size) {
    const anim = meta.animations.Front_Idle;
    const index = sampleAnimationFrame('Front_Idle', now, reduced);
    const f = meta.frames[anim.frameNames[index]].frame, scale = size / meta.frameWidth;
    element.style.backgroundSize = `${meta.columns * size}px ${meta.rows * size}px`;
    element.style.backgroundPosition = `${-f.x * scale}px ${-f.y * scale}px`;
    element.dataset.frame = String(index);
  }
  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden) return;
    if (!panel.hidden) {
      countdown.textContent = connected ? `출발까지 ${Math.ceil(remaining() / 1000)}초` : '연결 대기';
      refresh();
      if (!panel.closest('.collapsed')) for (const view of views) if (view.meta) draw(view.preview, view.meta, now, 72);
    }
  }
  requestAnimationFrame(frame);
  return {
    update(next, at, speed, isConnected) { state = next; receivedAt = at; rate = speed; connected = isConnected; refresh(); },
    focus() { if (!panel.hidden) panel.querySelector('[aria-pressed="true"]')?.focus(); }
  };
}
