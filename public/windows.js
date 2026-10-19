import { desktopLayout } from './viewport-layout.js';
export function initWindows() {
  const desktop = document.querySelector('#desktop'), shell = document.querySelector('#viewport-shell'), controls = document.querySelector('#combat-controls'), windows = [...desktop.querySelectorAll('.window')];
  let layout = { stacked: false, height: 610 }, availableHeight = 610;
  const layoutKey = () => `zwiequest-layout-v6-controls:${Math.round(desktop.clientWidth)}x${Math.round(availableHeight)}`;
  function measureLayout() {
    shell.dataset.stacked = String(shell.clientWidth - 32 < 806);
    const chromeHeight = ['.topbar', '.page-footer'].reduce((sum, selector) => sum + document.querySelector(selector).getBoundingClientRect().height, 0);
    availableHeight = Math.max(0, shell.clientHeight - chromeHeight - 20);
    layout = desktopLayout(shell.clientWidth - 32, availableHeight, controls.getBoundingClientRect().height);
    desktop.style.setProperty('--details-height', layout.details + 'px');
    desktop.style.setProperty('--world-height', layout.worldHeight + 'px');
    desktop.style.setProperty('--world-scale', String(layout.worldScale));
  }
  let z = 10, ready = false, activeLayoutKey = '';
  const readLayout = key => { try { return JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch { return {}; } };
  // A separate key keeps the old three-window layout available without restoring it here.
  const validHeight = (value, fallback) => Number.isFinite(Number(value)) && Number(value) > 38 ? Number(value) : fallback;
  function save() { if (!ready || layout.stacked) return; const state = Object.fromEntries(windows.map(w => [w.dataset.window, { x: w.offsetLeft, y: w.offsetTop, width: w.offsetWidth, height: w.classList.contains('collapsed') ? validHeight(w.dataset.expandedHeight, Number(w.dataset.defaultHeight)) : w.offsetHeight, collapsed: w.classList.contains('collapsed'), expandedHeight: w.classList.contains('collapsed') ? validHeight(w.dataset.expandedHeight, Number(w.dataset.defaultHeight)) : w.offsetHeight, z: +w.style.zIndex || 1 }])); try { localStorage.setItem(activeLayoutKey, JSON.stringify(state)); } catch {} }
  function setup(reset = false) {
    ready = false;
    windows.forEach(w => { w.removeAttribute('style'); w.classList.remove('collapsed'); w.querySelector('.minimize').textContent = '−'; w.querySelector('.minimize').setAttribute('aria-expanded', 'true'); });
    desktop.style.height = '';
    controls.removeAttribute('style');
    measureLayout();
    windows.forEach(w => { w.dataset.defaultHeight = String(w.getBoundingClientRect().height); delete w.dataset.expandedHeight; });
    if (layout.stacked) { ready = true; return; }
    const base = desktop.getBoundingClientRect(), rects = windows.map(w => w.getBoundingClientRect());
    activeLayoutKey = layoutKey();
    const current = readLayout(activeLayoutKey);
    const stored = reset ? {} : current;
    windows.forEach((w, i) => {
      const s = stored[w.dataset.window], r = rects[i];
      const brokenRestore = s?.expandedHeight != null && Number(s.expandedHeight) <= 38;
      const restoredHeight = w.dataset.window === 'world' ? 422 : brokenRestore ? r.height : validHeight(s?.collapsed ? s.expandedHeight : s?.height, validHeight(s?.height, r.height));
      const height = w.dataset.window === 'world' ? 422 : Math.max(w.dataset.window === 'details' ? 240 : 110, Math.min(restoredHeight, layout.height));
      const width = w.dataset.window === 'world' ? 514 : Math.max(280, Math.min(Number(s?.width) || r.width, desktop.clientWidth));
      w.dataset.expandedHeight = String(height);
      const x = s ? Math.min(Math.max(0, s.x), desktop.clientWidth - width) : r.left - base.left;
      const y = s ? Math.max(0, Math.min(s.y, layout.height - reserve(w) - (s.collapsed ? 38 : height))) : r.top - base.top;
      Object.assign(w.style, { position: 'absolute', gridColumn: 'auto', gridRow: 'auto', left: `${x}px`, top: `${y}px`, width: `${width}px`, height: `${height}px`, zIndex: s?.z || 1 });
      if (s?.collapsed) w.classList.add('collapsed');
      w.querySelector('.minimize').textContent = s?.collapsed ? '+' : '−';
      w.querySelector('.minimize').setAttribute('aria-expanded', String(!s?.collapsed));
    });
    windows.forEach(constrain);
    ready = true; extent(); save();
  }
  function reserve(w) { return w.dataset.window === 'world' ? controls.getBoundingClientRect().height + 12 : 0; }
  function constrain(w) { w.style.maxWidth = (desktop.clientWidth - w.offsetLeft) + 'px'; w.style.maxHeight = Math.max(w.dataset.window === 'world' ? 422 : w.dataset.window === 'details' ? 240 : 110, layout.height - reserve(w) - w.offsetTop) + 'px'; }
  function extent() {
    if (layout.stacked) return;
    const world = windows.find(w => w.dataset.window === 'world');
    Object.assign(controls.style, { position: 'absolute', left: world.offsetLeft + 'px', top: (world.offsetTop + world.offsetHeight + 12) + 'px' });
    desktop.style.height = Math.max(controls.offsetTop + controls.offsetHeight, ...windows.map(w => w.offsetTop + w.offsetHeight)) + 'px';
  }
  for (const w of windows) {
    w.addEventListener('pointerdown', () => { w.style.zIndex = ++z; });
    const bar = w.querySelector('.window-bar');
    bar.addEventListener('pointerdown', e => {
      if (e.target.closest('button') || layout.stacked) return;
      const startX = e.clientX, startY = e.clientY, left = w.offsetLeft, top = w.offsetTop;
      bar.setPointerCapture(e.pointerId); bar.style.cursor = 'grabbing';
      const move = m => { w.style.left = Math.min(Math.max(0, left + m.clientX - startX), desktop.clientWidth - w.offsetWidth) + 'px'; w.style.top = Math.max(0, Math.min(top + m.clientY - startY, layout.height - reserve(w) - w.offsetHeight)) + 'px'; extent(); };
      const up = () => { bar.removeEventListener('pointermove', move); bar.removeEventListener('pointerup', up); bar.removeEventListener('pointercancel', up); bar.style.cursor = ''; constrain(w); save(); };
      bar.addEventListener('pointermove', move); bar.addEventListener('pointerup', up); bar.addEventListener('pointercancel', up);
    });
    w.querySelector('.minimize').addEventListener('click', () => {
      const collapsed = !w.classList.contains('collapsed');
      // Measure the expanded border box before CSS reduces it to the header.
      if (collapsed) w.dataset.expandedHeight = String(w.getBoundingClientRect().height);
      w.classList.toggle('collapsed', collapsed);
      if (!collapsed) {
        if (layout.stacked) w.style.removeProperty('height');
        else w.style.height = validHeight(w.dataset.expandedHeight, Number(w.dataset.defaultHeight)) + 'px';
      }
      w.querySelector('.minimize').textContent = collapsed ? '+' : '−'; w.querySelector('.minimize').setAttribute('aria-expanded', String(!collapsed)); extent(); save();
    });
    new ResizeObserver(() => { if (ready) { extent(); save(); } }).observe(w);
  }
  document.querySelector('#restore').addEventListener('click', () => { try { localStorage.removeItem(layoutKey()); } catch {} windows.forEach(w => w.querySelector('.minimize').textContent = '−'); setup(true); });
  let resizeFrame;
  function resize() {
    // Pinch zoom should magnify the page without changing the saved window layout.
    if (window.visualViewport && Math.abs(window.visualViewport.scale - 1) > .01) return;
    if (window.visualViewport) shell.style.setProperty('--viewport-height', window.visualViewport.height + 'px');
    ready = false;
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => setup());
  }
  addEventListener('resize', resize);
  window.visualViewport?.addEventListener('resize', resize);
  addEventListener('orientationchange', () => { for (const delay of [0, 120, 320, 640]) setTimeout(resize, delay); });
  const viewportObserver = new ResizeObserver(resize);
  for (const element of [shell, controls, document.querySelector('.topbar'), document.querySelector('.page-footer')]) viewportObserver.observe(element);
  setup(); resize();
}
