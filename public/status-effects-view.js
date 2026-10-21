const safeIcon = path => /^\/assets\/skills\/[a-z0-9-]+\.webp$/.test(path || '');
export function statusPresentation(effect, elapsedMs = 0, rate = 1, advancing = true) {
  const remainingMs = Math.max(0, effect.remainingMs - (advancing ? Math.max(0, elapsedMs) * rate * (effect.decayRate ?? 1) : 0));
  const duration = Math.max(1, effect.durationMs || effect.remainingMs);
  const elapsedFraction = Math.max(0, Math.min(1, 1 - remainingMs / duration));
  return { remainingMs, angle: elapsedFraction * 360,
    label: `${effect.name}(${(remainingMs / 1000).toFixed(1)}초)` };
}
// Reconcile by effect identity. Neither server snapshots nor the countdown replace images.
export function initStatusEffects({ world, columns, tooltip }) {
  const views = { hero: new Map(), enemy: new Map() };
  let state = null, receivedAt = 0, rate = 1, connected = false, activeView = null, frozenElapsed = 0;
  function hideTooltip() { activeView?.button.removeAttribute('aria-describedby'); activeView = null; tooltip.hidden = true; }
  function showTooltip(view) {
    activeView = view; tooltip.hidden = false; view.button.setAttribute('aria-describedby', tooltip.id); refresh();
  }
  function refresh() {
    const elapsed = connected ? Math.max(0, performance.now() - receivedAt) : frozenElapsed;
    for (const actor of ['hero', 'enemy']) for (const view of views[actor].values()) {
      const presentation = statusPresentation(view.effect, elapsed, rate, state?.phase === 'BATTLE');
      view.button.style.setProperty('--status-elapsed-angle', `${presentation.angle.toFixed(2)}deg`);
      view.button.setAttribute('aria-label', presentation.label);
      view.label = presentation.label;
    }
    if (activeView) {
      tooltip.textContent = activeView.label;
      tooltip.dataset.side = activeView.actor;
      // Coordinates remain in the 512x384 world; its existing responsive transform scales the HUD too.
      const top = columns[activeView.actor].offsetTop + activeView.button.offsetTop;
      tooltip.style.top = `${Math.max(8, Math.min(top, world.clientHeight - tooltip.offsetHeight - 8))}px`;
    }
  }
  function reconcile(actor, effects) {
    const map = views[actor], wanted = new Set(effects.map(e=>e.id));
    for (const [id, view] of map) if (!wanted.has(id)) { if (activeView === view) hideTooltip(); view.button.remove(); map.delete(id); }
    for (const effect of effects) {
      let view = map.get(effect.id);
      if (!view) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'world-status-icon'; button.dataset.statusId = effect.id;
        const img = document.createElement('img'); img.alt = ''; img.draggable = false;
        const shade = document.createElement('span'); shade.className = 'world-status-shade'; shade.setAttribute('aria-hidden', 'true');
        button.append(img, shade); columns[actor].append(button);
        view = { button, img, actor, effect }; map.set(effect.id, view);
        button.addEventListener('pointerenter', ()=>showTooltip(view));
        button.addEventListener('pointerleave', ()=>{ if (activeView === view) hideTooltip(); });
        button.addEventListener('focus', ()=>showTooltip(view));
        button.addEventListener('blur', ()=>{ if (activeView === view) hideTooltip(); });
        button.addEventListener('click', event=>{ event.stopPropagation(); showTooltip(view); });
        button.addEventListener('keydown', event=>{ if (event.key === 'Escape') { hideTooltip(); button.blur(); } });
      }
      view.effect = effect; view.button.dataset.polarity = effect.polarity;
      const icon = safeIcon(effect.iconPath) ? effect.iconPath : '/assets/skills/purify-v1.webp';
      if (view.img.getAttribute('src') !== icon) view.img.setAttribute('src', icon);
    }
    columns[actor].hidden = effects.length === 0;
  }
  const timer = setInterval(()=>{ if (!document.hidden) refresh(); }, 100);
  return {
    update(next, at = performance.now(), online = true, nextRate = 1) {
      if (state?.battle?.id !== next?.battle?.id || state?.activeCharacterId !== next?.activeCharacterId) {
        for (const actor of ['hero','enemy']) reconcile(actor, []); hideTooltip();
      }
      state = next; receivedAt = at; frozenElapsed = 0; connected = online; rate = nextRate;
      for (const actor of ['hero','enemy']) reconcile(actor, next?.phase === 'BATTLE' ? next.statusEffects?.[actor] || [] : []);
      refresh();
    },
    disconnect() { if (connected) frozenElapsed = Math.max(0, performance.now() - receivedAt); connected = false; refresh(); },
    destroy() { clearInterval(timer); for (const actor of ['hero','enemy']) reconcile(actor, []); hideTooltip(); }
  };
}
