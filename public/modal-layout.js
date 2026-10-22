// Intersect the layout viewport's safe rectangle with the visible viewport.
// Keyboard/browser chrome already excluded by visualViewport is not subtracted twice.
export function modalSafeBounds(layout, visible = layout, insets = {}) {
  const nonnegative = n => Math.max(0, Number(n) || 0);
  const width = nonnegative(layout.width), height = nonnegative(layout.height);
  const x = nonnegative(visible.offsetLeft), y = nonnegative(visible.offsetTop);
  const left = Math.min(width, Math.max(x, nonnegative(insets.left)));
  const top = Math.min(height, Math.max(y, nonnegative(insets.top)));
  const right = Math.min(width - nonnegative(insets.right), x + nonnegative(visible.width));
  const bottom = Math.min(height - nonnegative(insets.bottom), y + nonnegative(visible.height));
  return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

export function initModalViewport(win = window, root = document.documentElement) {
  let frame;
  const update = () => {
    if (win.visualViewport && Math.abs(win.visualViewport.scale - 1) > .01) return;
    const style = win.getComputedStyle(root);
    const insets = Object.fromEntries(['top', 'right', 'bottom', 'left'].map(side =>
      [side, parseFloat(style.getPropertyValue(`--safe-${side}`)) || 0]));
    const layout = { width: root.clientWidth, height: win.innerHeight };
    const bounds = modalSafeBounds(layout, win.visualViewport || layout, insets);
    for (const [key, value] of Object.entries(bounds)) root.style.setProperty(`--modal-safe-${key}`, `${value}px`);
  };
  const schedule = () => { win.cancelAnimationFrame(frame); frame = win.requestAnimationFrame(update); };
  win.addEventListener('resize', schedule);
  win.addEventListener('orientationchange', schedule);
  win.visualViewport?.addEventListener('resize', schedule);
  win.visualViewport?.addEventListener('scroll', schedule);
  update();
  return () => {
    win.cancelAnimationFrame(frame);
    win.removeEventListener('resize', schedule);
    win.removeEventListener('orientationchange', schedule);
    win.visualViewport?.removeEventListener('resize', schedule);
    win.visualViewport?.removeEventListener('scroll', schedule);
  };
}

// Keep the existing close button outside the scrolling content, without resizing it.
export function prepareModalScroll(dialog) {
  if (dialog.classList.contains('scrollable-modal')) return;
  const close = dialog.querySelector(':scope > .dialog-close:not(.primary)');
  const content = document.createElement('div');
  content.className = 'modal-scroll';
  for (const node of [...dialog.childNodes]) if (node !== close) content.append(node);
  dialog.append(content);
  dialog.classList.add('scrollable-modal');
}
