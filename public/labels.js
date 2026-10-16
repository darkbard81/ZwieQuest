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
  // Translate saved historical text only for display; original server events remain intact.
  return String(text).split(/\b(STR|CON|DEX|PER|INT|RES|ACC|DEF|FOR|REF|WIL|PEN|AR|HP|AP|LB)\b/g)
    .map((part, index) => index % 2 ? statLabelHTML(part) : escapeHTML(part)).join('');
}
