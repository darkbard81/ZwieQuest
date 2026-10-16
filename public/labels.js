import { damageNames, damageTagHTML } from './damage-tags.js';
export const statNames = Object.freeze({ STR: '힘', CON: '체질', DEX: '민첩', PER: '지각', INT: '지능', RES: '의지',
  ACC: '명중', DEF: '방어', FOR: '인내', REF: '반사', WIL: '정신', PEN: '관통력', AR: '방어도', HP: '체력', AP: '행동력', LB: '레벨 보너스', power: '피해' });
const defenses = new Set(['DEF', 'FOR', 'REF', 'WIL']);
const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function statLabelHTML(key, value) {
  const name = escapeHTML(statNames[key] || key);
  const amount = value == null ? '' : ` <b>${escapeHTML(value)}</b>`;
  return defenses.has(key) ? `<span class="defense-tag defense-${key}">${name}${amount}</span>` : `${name}${amount}`;
}
export function logHTML(text) {
  // Format only the actual hit's damage suffix, never item names or saved data.
  const source = String(text), typeByName = Object.fromEntries(Object.entries(damageNames).map(([id, name]) => [name, id]));
  const tokens = /\b(STR|CON|DEX|PER|INT|RES|ACC|DEF|FOR|REF|WIL|PEN|AR|HP|AP|LB)\b|(베기|찌르기|때리기|화염|냉기|전기|부식|Raw)(?= (?:\/ AR\b|고정\)))/g;
  let html = '', cursor = 0;
  for (const match of source.matchAll(tokens)) {
    html += escapeHTML(source.slice(cursor, match.index));
    html += match[1] ? statLabelHTML(match[1]) : damageTagHTML(typeByName[match[2]]);
    cursor = match.index + match[0].length;
  }
  return html + escapeHTML(source.slice(cursor));
}
