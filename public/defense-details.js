// Keep the selected formula open and current while server snapshots arrive.
export function initDefenseDetails(stats, panel) {
  let selected = null;
  function update() {
    const buttons = [...stats.querySelectorAll('button[data-defense]')];
    const active = buttons.find(button => button.dataset.defense === selected);
    if (!active) selected = null;
    for (const button of buttons) button.setAttribute('aria-expanded', String(button === active));
    panel.hidden = !active;
    const text = active?.title || '';
    if (panel.querySelector('p').textContent !== text) panel.querySelector('p').textContent = text;
  }
  function close() { selected = null; update(); }
  stats.addEventListener('click', event => {
    const button = event.target.closest('button[data-defense]');
    if (!button || !stats.contains(button)) return;
    selected = selected === button.dataset.defense ? null : button.dataset.defense;
    update();
  });
  document.addEventListener('click', event => {
    if (!stats.contains(event.target) && !panel.contains(event.target)) close();
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !selected) return;
    if (panel.contains(document.activeElement)) stats.querySelector(`button[data-defense="${selected}"]`)?.focus();
    close();
  });
  return { update };
}
