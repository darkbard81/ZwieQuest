import { uiIconHTML } from './ui-icons.js';
// Shared visual identity for weapon damage, armor modifiers and combat logs.
export const damageStyles = Object.freeze({
  slash: { name: '베기', group: 'physical' },
  pierce: { name: '관통', group: 'physical' },
  blunt: { name: '부수기', group: 'physical' },
  fire: { name: '소각', group: 'elemental' },
  cold: { name: '동결', group: 'elemental' },
  lightning: { name: '충격', group: 'elemental' },
  corrosion: { name: '부식', group: 'elemental' },
  raw: { name: '고정', group: 'raw' }
});
export const damageNames = Object.freeze(Object.fromEntries(Object.entries(damageStyles).map(([id, style]) => [id, style.name])));
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function damageTagHTML(type, value) {
  const style = Object.hasOwn(damageStyles, type) ? damageStyles[type] : null;
  if (!style) return esc(type);
  const amount = value == null ? '' : ` <b>${esc(value)}</b>`;
  const title = type === 'raw' ? '고정 피해 · 빗나갈 수 있음' : `${style.group === 'physical' ? '물리' : '속성'} 피해 · ${style.name}`;
  return `<span class="damage-tag damage-${type}" data-damage-group="${style.group}" title="${title}">${uiIconHTML('damage', type)} ${style.name}${amount}</span>`;
}
