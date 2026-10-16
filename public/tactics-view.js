export function tacticDescription(tactic) {
  if (!tactic || tactic.id === 'normal') return '일반 공격 1 AP ×3 · 연속 명중 페널티 0 / −5 / −10';
  const e = tactic.effect;
  if (tactic.id === 'defend') return `2 AP 예약 · 라운드 시작부터 방어도 +${e.AR} · 일반 공격 1회`;
  if (tactic.id === 'assault') return `2 AP · 명중 +${e.ACC} · 일반 공격 1회`;
  if (tactic.id === 'heal') return `2 AP · 체력 ${e.heal} 회복(최대 체력까지) · 일반 공격 1회`;
  return `2 AP · 다음 1회 피해 +${Math.round(e.damageRate * 100)}% · 빗나가도 소모`;
}
export function roundStatus(state) {
  const b = state.battle;
  if (!b || state.phase !== 'BATTLE') return `승리 ${state.victories}회 · 보물 ${state.chests}개 · 전술은 다음 전투부터 적용`;
  const name = id => state.availableTactics?.find(t => t.id === id)?.name || '일반';
  const buffs = Object.entries(b.roundEffects || {}).map(([k,v]) => k === 'damageRate' ? `다음 피해 +${Math.round(v * 100)}%` : `${k === 'AR' ? '방어도' : '명중'} +${v}`);
  return `라운드 ${b.turn} · ${b.actor === 'hero' ? '모험가' : '몬스터'} 턴 · 행동력 ${b.ap}/3 · 적용 ${name(b.roundTactic)}${buffs.length ? ' (' + buffs.join(' · ') + ')' : ''}${state.tactic !== b.roundTactic ? ` · 다음: ${name(state.tactic)}` : ''}`;
}
