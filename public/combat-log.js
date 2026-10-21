import { statLabelHTML, logHTML } from './labels.js';
import { damageTagHTML } from './damage-tags.js';

const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tag = (label, value, title = '') => `<span class="combat-value-tag"${title ? ` title="${esc(title)}"` : ''}>${esc(label)}${value == null ? '' : ` <b>${esc(value)}</b>`}</span>`;
const stat = (key, value, title = '') => `<span class="combat-stat-tag"${title ? ` title="${esc(title)}"` : ''}>${statLabelHTML(key, value)}</span>`;
const percent = value => `${Number((value * 100).toFixed(6))}%`;

export function combatLogHTML(entry) {
  const h = entry.hit, c = h?.calculation;
  // Older records do not contain the original accuracy and damage factors.
  if (!c || !h.attackerName || !h.defenderName) return logHTML(entry.text);
  const outcome = h.label === '빗나감' ? '미스' : h.label;
  const result = `<span class="combat-result combat-result-${h.tier}">${esc(outcome)}</span>`;
  const sequence = h.actionSeq != null ? `${tag('행동', h.actionSeq)} ${tag('전투 시간', `${(h.combatTimeMs / 1000).toFixed(2)}초`)} · ` : '';
  const summary = `${sequence}${h.skillId ? `${tag(h.ability)} · ` : ''}${esc(h.attackerName)} → ${esc(h.defenderName)} · ${result}! ${damageTagHTML(h.damageType)} ${tag('피해', h.damage)}`;
  const natural = h.roll === 20 ? tag('자연 20 · 판정 ↑') : h.roll === 1 ? tag('자연 1 · 판정 ↓') : '';
  const accuracy = `${stat('ACC', c.acc, h.actionSeq != null ? '현재 장비와 유지형 스킬을 반영한 명중' : '당시 연속 공격 페널티와 전술 보정을 반영한 명중')} + ${tag('🎲', h.roll, '20면체 주사위 눈금')} vs ${stat(h.target, c.defense)} + ${tag('기준', 10)} → ${result}${h.originalTier != null && h.originalTier !== h.tier ? tag('상태 효과 판정 전환') : ''}${natural ? ` ${natural}` : ''}`;
  let damage;
  if (h.damageType === 'raw') {
    damage = `${tag('고정', c.fixedDamage)} · ${tag('방어도 무시')} → ${tag('피해', h.damage, '미스이면 0, 그 외에는 고정 피해 그대로 적용')}`;
  } else {
    const labels = { grade: '등급', tactic: '전술', strength: '힘', hit: outcome, armor: '방어 보정' };
    const allFactors = {...c.factors, ...(c.skillDamageMultiplier ? {skill:c.skillDamageMultiplier} : {})}; labels.skill='스킬';
    const factors = Object.entries(allFactors).filter(([, value]) => value !== 1).map(([key, value]) => `${labels[key]} ${percent(value)}`);
    const multiplier = Object.values(allFactors).reduce((total, value) => total * value, 1);
    damage = `${stat('PEN', h.pen)} vs ${stat('AR', h.effectiveAR, '이번 피해 타입의 약점·저항과 전술을 반영한 방어도')} = ${tag('기본 피해', h.base)} × ${tag('배율', percent(multiplier), factors.join(' × ') || '추가 보정 없음')} = ${tag('피해', h.damage, '모든 보정을 곱한 뒤 소수점 버림')}`;
  }
  return `<span class="combat-summary">${summary}</span>\n<span class="combat-calculation combat-accuracy">${accuracy}</span>\n<span class="combat-calculation combat-damage">${damage}</span>`;
}
