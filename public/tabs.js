export function initInfoTabs() {
  const tabs = [...document.querySelectorAll('.info-tabs [role="tab"]')];
  const key = 'zwiequest-info-tab';
  function select(tab, focus = false) {
    for (const item of tabs) {
      const active = item === tab;
      item.setAttribute('aria-selected', String(active));
      item.tabIndex = active ? 0 : -1;
      document.getElementById(item.getAttribute('aria-controls')).hidden = !active;
    }
    try { localStorage.setItem(key, tab.id); } catch {}
    if (focus) tab.focus();
    document.dispatchEvent(new CustomEvent('info-tab-change', { detail: tab.id }));
  }
  for (const [index, tab] of tabs.entries()) {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      else return;
      event.preventDefault(); event.stopPropagation(); select(tabs[next], true);
    });
  }
  let saved;
  try { saved = localStorage.getItem(key); } catch {}
  select(tabs.find(tab => tab.id === saved) || tabs[0]);
}
