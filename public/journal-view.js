import { logHTML } from './labels.js';
import { combatLogHTML } from './combat-log.js';

export function initJournal(list, panel, unread) {
  let latest = null, follow = true, reading = null;
  const visible = () => !panel.hidden && list.clientHeight > 0;
  const bottom = () => { list.scrollTop = list.scrollHeight; };
  function remember() {
    if (!visible() || follow) return;
    const top = list.getBoundingClientRect().top;
    const anchor = [...list.children].find(el => el.getBoundingClientRect().bottom > top);
    if (anchor) reading = { seq: anchor.dataset.seq, offset: anchor.getBoundingClientRect().top - top };
  }
  function restore() {
    const anchor = [...list.children].find(el => el.dataset.seq === reading?.seq);
    if (anchor) list.scrollTop += anchor.getBoundingClientRect().top - list.getBoundingClientRect().top - reading.offset;
    else list.scrollTop = 0;
  }
  list.addEventListener('scroll', () => {
    if (visible()) {
      follow = list.scrollHeight - list.clientHeight - list.scrollTop < 8;
      remember();
    }
  });
  document.addEventListener('info-tab-change', () => {
    if (panel.hidden) return;
    unread.hidden = true;
    follow = true; reading = null; bottom();
  });
  new ResizeObserver(() => { if (visible() && follow) bottom(); }).observe(list);
  return {
    reset() { latest = null; follow = true; reading = null; unread.hidden = true; list.replaceChildren(); },
    update(logs) {
      const entries = logs.slice(0, 45).reverse();
      const next = entries.at(-1)?.seq ?? null;
      if (latest !== null && next > latest && panel.hidden) unread.hidden = false;
      remember();
      list.replaceChildren(...entries.map(entry => {
        const item = document.createElement('li');
        item.className = entry.type;
        item.dataset.seq = String(entry.seq);
        item.innerHTML = entry.type === 'hit' ? combatLogHTML(entry) : logHTML(entry.text);
        return item;
      }));
      if (visible()) { if (follow) bottom(); else restore(); }
      latest = next;
    }
  };
}
