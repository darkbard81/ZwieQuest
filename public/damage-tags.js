// Shared visual identity for weapon damage, armor modifiers and combat logs.
export const damageStyles = Object.freeze({
  slash: { name: '베기', emoji: '🗡️', group: 'physical' },
  pierce: { name: '찌르기', emoji: '🔱', group: 'physical' },
  blunt: { name: '때리기', emoji: '🔨', group: 'physical' },
  fire: { name: '화염', emoji: '🔥', group: 'elemental' },
  cold: { name: '냉기', emoji: '❄️', group: 'elemental' },
  lightning: { name: '전기', emoji: '⚡', group: 'elemental' },
  corrosion: { name: '부식', emoji: '🧪', group: 'elemental' },
  raw: { name: 'Raw', emoji: '💠', group: 'raw' }
});
export const damageNames = Object.freeze(Object.fromEntries(Object.entries(damageStyles).map(([id, style]) => [id, style.name])));
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function damageTagHTML(type, value) {
  const style = Object.hasOwn(damageStyles, type) ? damageStyles[type] : null;
  if (!style) return esc(type);
  const amount = value == null ? '' : ` <b>${esc(value)}</b>`;
  const title = type === 'raw' ? '고정 피해 · 빗나갈 수 있음' : `${style.group === 'physical' ? '물리' : '속성'} 피해 · ${style.name}`;
  return `<span class="damage-tag damage-${type}" data-damage-group="${style.group}" title="${title}"><span aria-hidden="true">${style.emoji}</span> ${style.name}${amount}</span>`;
}
