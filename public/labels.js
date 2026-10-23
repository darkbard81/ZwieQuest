import { uiIconHTML } from './ui-icons.js';
import { damageNames, damageTagHTML } from './damage-tags.js';
export const statNames = Object.freeze({ STR: '힘', CON: '체질', DEX: '민첩', PER: '통찰', INT: '지능', RES: '결의',
  ACC: '명중', DEF: '회피', FOR: '인내', REF: '반사', WIL: '의지', PEN: '관통력', AR: '방어도', HP: '체력', AP: '행동력', actionSpeed: '행동속도', LB: '레벨 보너스', power: '피해', attackDamage: '공격력' });
const defenses = new Set(['DEF', 'FOR', 'REF', 'WIL']);
const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function defenseTooltip(key, detail) {
  if (!detail || !defenses.has(key)) return '';
  const terms = [`${detail.equipment ? '기본·상시' : '기본값'}(${detail.base + (detail.equipment || 0)})`, ...detail.attributes.map(a => `${statNames[a.key]}(${a.value})${(a.multiplier ?? 1) === 1 ? '' : ` × ${a.multiplier}`}`)];
  if (detail.levelBonus) terms.push(`레벨 보너스(${detail.levelBonus})`);
  if (detail.status) terms.push(`상태 보정(${detail.status})`);
  if (detail.equipmentMastery) terms.push(`장비 숙련(${detail.equipmentMastery})`);
  if (detail.mastery) terms.push(`직업 숙련(${detail.mastery.value})`);
  return `${terms.join(' + ')} = ${detail.total}`;
}
export function statLabelHTML(key, value, tooltip = '') {
  const name = (key === 'attackDamage' ? uiIconHTML('damage', 'slash') : uiIconHTML('stat', key)) + escapeHTML(statNames[key] || key);
  const amount = value == null ? '' : ` <b>${escapeHTML(value)}</b>`;
  if (!defenses.has(key)) return `${name}${amount}`;
  if (tooltip) return `<button type="button" class="defense-tag defense-${key}" data-defense="${key}" aria-expanded="false" aria-controls="defense-details" title="${escapeHTML(tooltip)}">${name}${amount}</button>`;
  return `<span class="defense-tag defense-${key}">${name}${amount}</span>`;
}
export function logHTML(text) {
  // Format only the actual hit's damage suffix, never item names or saved data.
  const source = String(text), typeByName = { ...Object.fromEntries(Object.entries(damageNames).map(([id, name]) => [name, id])), '찌르기': 'pierce', '때리기': 'blunt', '화염': 'fire', '냉기': 'cold', '전기': 'lightning', Raw: 'raw' };
  const tokens = /\b(STR|CON|DEX|PER|INT|RES|ACC|DEF|FOR|REF|WIL|PEN|AR|HP|AP|LB)\b|(베기|관통|부수기|소각|동결|충격|고정|찌르기|때리기|화염|냉기|전기|부식|Raw)(?= (?:\/ AR\b|고정\)|피해\)))/g;
  let html = '', cursor = 0;
  for (const match of source.matchAll(tokens)) {
    html += escapeHTML(source.slice(cursor, match.index));
    html += match[1] ? statLabelHTML(match[1]) : damageTagHTML(typeByName[match[2]]);
    cursor = match.index + match[0].length;
  }
  return html + escapeHTML(source.slice(cursor));
}

// Display formatting never feeds back into combat speed or readiness calculations.
export const combatStatDisplay = (key, value) => key === 'actionSpeed' ? Math.trunc(value) : Number(value.toFixed(2));
export function attributeValueHTML(value, detail) {
  const delta = detail?.status || 0, polarity = delta > 0 ? 'buff' : delta < 0 ? 'debuff' : '';
  const signed = n => n > 0 ? `+${n}` : String(n);
  const title = detail ? `기본 ${detail.base} · 장비 ${signed(detail.equipment)} · 상태 ${signed(delta)} = ${value}` : '';
  return `<b class="attribute-value" data-polarity="${polarity}" title="${escapeHTML(title)}">${escapeHTML(value)}${delta ? `<span class="attribute-status-delta"> (${escapeHTML(signed(delta))})</span>` : ''}</b>`;
}
