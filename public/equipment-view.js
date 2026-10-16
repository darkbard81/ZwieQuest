import { statLabelHTML } from './labels.js';
import { damageTagHTML } from './damage-tags.js';
export { damageNames } from './damage-tags.js';
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const signed = n => n > 0 ? `+${n}` : String(n);
export function itemIconHTML(item, empty = 'armor') {
  if (/^\/assets\/equipment\/[a-z]+(?:-[a-z]+)*-v1\.png$/.test(item?.iconPath || '')) return `<img class="equipment-icon" src="${item.iconPath}" alt="${esc(item.name)}" width="43" height="43" loading="lazy">`;
  const icon = ['sword', 'staff', 'armor', 'charm'].includes(item?.icon) ? item.icon : empty === 'weapon' ? 'sword' : empty;
  return `<span class="icon ${esc(icon)}" aria-hidden="true"></span>`;
}
export function itemDetailsHTML(item) {
  const pieces = [];
  if (item.damageTypes) {
    const rate = 1 + (item.damageRate || 0), scaled = n => Number((n * rate).toFixed(2));
    pieces.push(item.damageTypes.includes('raw') ? `고정 피해 <b>${item.fixedDamage}</b>` : `무기 피해 <b>${scaled(item.damageMin)}–${scaled(item.damageMax)}</b>${item.damageRate ? ` <small>(기본 ${item.damageMin}–${item.damageMax} · +${Math.round(item.damageRate * 100)}%)</small>` : ''}`);
    pieces.push(`<span class="damage-types">${item.damageTypes.map(t => damageTagHTML(t)).join(' ')}</span>`);
  }
  if (item.slot === 'weapon' && item.hitDefense) pieces.push(`명중 판정: ${statLabelHTML(item.hitDefense)}`);
  pieces.push(Object.entries(item.stats).map(([k, v]) => statLabelHTML(k, signed(v))).join(' · '));
  if (item.typeModifiers && Object.keys(item.typeModifiers).length) pieces.push(`<span class="armor-matchups">${Object.entries(item.typeModifiers).map(([t, v]) => `<span class="armor-matchup">${damageTagHTML(t, signed(v))} <small>(방어도 ${item.stats.AR + v})</small></span>`).join(' · ')}</span>`);
  return pieces.filter(Boolean).join('<br>');
}
