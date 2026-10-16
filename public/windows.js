export function initWindows() {
  const desktop = document.querySelector('#desktop'), windows = [...desktop.querySelectorAll('.window')], layoutKey = () => `zwiequest-layout-v2-tabs:${Math.round(desktop.clientWidth)}`;
  let z = 10, ready = false;
  const validHeight = (value, fallback) => Number.isFinite(Number(value)) && Number(value) > 38 ? Number(value) : fallback;
  function save() { if (!ready || innerWidth < 850) return; const state = Object.fromEntries(windows.map(w => [w.dataset.window, { x: w.offsetLeft, y: w.offsetTop, width: w.offsetWidth, height: w.classList.contains('collapsed') ? validHeight(w.dataset.expandedHeight, Number(w.dataset.defaultHeight)) : w.offsetHeight, collapsed: w.classList.contains('collapsed'), expandedHeight: w.classList.contains('collapsed') ? validHeight(w.dataset.expandedHeight, Number(w.dataset.defaultHeight)) : w.offsetHeight, z: +w.style.zIndex || 1 }])); localStorage.setItem(layoutKey(), JSON.stringify(state)); }
  function setup(reset = false) {
    ready = false;
    windows.forEach(w => { w.removeAttribute('style'); w.classList.remove('collapsed'); w.querySelector('.minimize').textContent = '−'; w.querySelector('.minimize').setAttribute('aria-expanded', 'true'); });
    desktop.style.height = '';
    windows.forEach(w => { w.dataset.defaultHeight = String(w.getBoundingClientRect().height); delete w.dataset.expandedHeight; });
    if (innerWidth < 850) { ready = true; return; }
    const base = desktop.getBoundingClientRect(), rects = windows.map(w => w.getBoundingClientRect());
    let stored = {}; if (!reset) try { stored = JSON.parse(localStorage.getItem(layoutKey()) || '{}'); } catch {}
    windows.forEach((w, i) => {
      const s = stored[w.dataset.window], r = rects[i];
      const brokenRestore = s?.expandedHeight != null && Number(s.expandedHeight) <= 38;
      const height = w.dataset.window === 'world' ? 422 : brokenRestore ? r.height : validHeight(s?.collapsed ? s.expandedHeight : s?.height, validHeight(s?.height, r.height));
      w.dataset.expandedHeight = String(height);
      const x = s ? Math.min(Math.max(0, s.x), desktop.clientWidth - 100) : r.left - base.left;
      const y = s ? Math.max(0, Math.min(s.y, 1500)) : r.top - base.top;
      Object.assign(w.style, { position: 'absolute', gridColumn: 'auto', gridRow: 'auto', left: `${x}px`, top: `${y}px`, width: `${w.dataset.window === 'world' ? 514 : s?.width || r.width}px`, height: `${height}px`, zIndex: s?.z || 1 });
      if (s?.collapsed) w.classList.add('collapsed');
      w.querySelector('.minimize').textContent = s?.collapsed ? '+' : '−';
      w.querySelector('.minimize').setAttribute('aria-expanded', String(!s?.collapsed));
    });
    ready = true; extent(); save();
  }
  function extent() { if (innerWidth >= 850) desktop.style.height = Math.max(0, ...windows.map(w => w.offsetTop + w.offsetHeight)) + 'px'; }
  for (const w of windows) {
    w.addEventListener('pointerdown', () => { w.style.zIndex = ++z; });
    const bar = w.querySelector('.window-bar');
    bar.addEventListener('pointerdown', e => {
      if (e.target.closest('button') || innerWidth < 850) return;
      const startX = e.clientX, startY = e.clientY, left = w.offsetLeft, top = w.offsetTop;
      bar.setPointerCapture(e.pointerId); bar.style.cursor = 'grabbing';
      const move = m => { w.style.left = Math.min(Math.max(0, left + m.clientX - startX), desktop.clientWidth - 100) + 'px'; w.style.top = Math.max(0, top + m.clientY - startY) + 'px'; extent(); };
      const up = () => { bar.removeEventListener('pointermove', move); bar.removeEventListener('pointerup', up); bar.removeEventListener('pointercancel', up); bar.style.cursor = ''; save(); };
      bar.addEventListener('pointermove', move); bar.addEventListener('pointerup', up); bar.addEventListener('pointercancel', up);
    });
    w.querySelector('.minimize').addEventListener('click', () => {
      const collapsed = !w.classList.contains('collapsed');
      // Measure the expanded border box before CSS reduces it to the header.
      if (collapsed) w.dataset.expandedHeight = String(w.getBoundingClientRect().height);
      w.classList.toggle('collapsed', collapsed);
      if (!collapsed) w.style.height = validHeight(w.dataset.expandedHeight, Number(w.dataset.defaultHeight)) + 'px';
      w.querySelector('.minimize').textContent = collapsed ? '+' : '−'; w.querySelector('.minimize').setAttribute('aria-expanded', String(!collapsed)); extent(); save();
    });
    new ResizeObserver(() => { if (ready) { extent(); save(); } }).observe(w);
  }
  document.querySelector('#restore').addEventListener('click', () => { localStorage.removeItem(layoutKey()); windows.forEach(w => w.querySelector('.minimize').textContent = '−'); setup(true); });
  let resizeTimer; addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => setup(), 150); }); setup();
}
