import { skillIconHTML } from './skills-view.js';
import { statLabelHTML } from './labels.js';
import { damageTagHTML } from './damage-tags.js';
export { damageNames } from './damage-tags.js';
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const signed = n => n > 0 ? `+${n}` : String(n);
export function itemIconHTML(item, empty = 'armor') {
  if (item?.slot === 'skill') return skillIconHTML(item);
  if (/^\/assets\/equipment\/[a-z]+(?:-[a-z]+)*-v1\.(?:webp|png)$/.test(item?.iconPath || '')) return `<img class="equipment-icon" src="${item.iconPath.replace(/\.png$/, '.webp')}" alt="${esc(item.name)}" width="43" height="43" loading="lazy">`;
  const icon = ['sword', 'staff', 'armor', 'charm'].includes(item?.icon) ? item.icon : empty === 'weapon' ? 'sword' : empty;
  return `<span class="icon ${esc(icon)}" aria-hidden="true"></span>`;
}
export function itemDetailsHTML(item) {
  const pieces = [];
  if (item.damageTypes) {
    const rate = 1 + (item.damageRate || 0), scaled = n => Math.floor(n * rate);
    pieces.push(item.damageTypes.includes('raw') ? `고정 피해 <b>${Math.floor(item.fixedDamage)}</b>` : `무기 피해 <b>${scaled(item.damageMin)}–${scaled(item.damageMax)}</b>`);
  }
  if (item.slot === 'weapon') {
    const tags = (item.damageTypes || []).map(t => damageTagHTML(t));
    if (item.hitDefense) tags.push(statLabelHTML(item.hitDefense));
    if (tags.length) pieces.push(`<span class="item-combat-tags">${tags.join('')}</span>`);
  }
  pieces.push(Object.entries(item.stats).map(([k, v]) => item.slot === 'armor' ? `<span class="item-stat-tag">${statLabelHTML(k, signed(v))}</span>` : statLabelHTML(k, signed(v))).join(item.slot === 'armor' ? ' ' : ' · '));
  if (item.slot === 'armor') pieces.push(`행동속도 -${Math.round((item.actionSpeedPenaltyRate || 0) * 100)}%`);
  if (item.typeModifiers && Object.keys(item.typeModifiers).length) pieces.push(`<span class="armor-matchups">${Object.entries(item.typeModifiers).map(([t, v]) => damageTagHTML(t, signed(v))).join(' ')}</span>`);
  return pieces.filter(Boolean).join('<br>');
}
