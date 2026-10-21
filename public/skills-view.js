const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function skillDescription(item) {
  if (!item.enabled) return '사용할 수 없는 스킬';
  const e=item.effect || {}, duration=item.durationMs ? ` · ${(item.durationMs/1000).toFixed(1)}초(INT)` : '';
  const effect = item.activationMode === 'toggle' ? `유지 효과 · 명중 +${item.accuracyBonus} · ${item.toggleOn ? 'ON' : 'OFF'}` : item.effectType === 'heal' ? `HP ${item.heal} 회복` : item.effectType === 'attack' ? `명중 vs ${e.defense} · 피해 +${Math.round(((e.damageMultiplier || 1)-1)*100)}%${e.accuracyBonus ? ` · 명중 +${e.accuracyBonus}` : ''}${e.penetrationBonus ? ` · 관통 +${e.penetrationBonus}` : ''} · 명중/치명타 시 ${item.statusName}${duration}` : item.effectType === 'status' ? `${item.statusName}: ${item.statusDescription || ''}${duration}` : item.effectType === 'mirror' ? `회피 +30 · 피명중마다 -10${duration}` : item.description;
  const limit = item.perBattleLimit == null ? '전투당 제한 없음' : item.remainingUses == null ? `전투당 ${item.perBattleLimit}회` : `남은 ${item.remainingUses}/${item.perBattleLimit}회${item.remainingUses === 0 ? ' · 소진' : ''}`;
  const context = item.useContexts?.length === 2 ? '전투/비전투' : item.useContexts?.includes('nonCombat') ? '비전투' : '전투';
  return `${effect} · ${context} · ${limit}`;
}
export function skillAvailability(state, item, now, connected = true) {
  const remaining = 0;
  const inCombat = state?.phase === 'BATTLE', toggle = item?.activationMode === 'toggle', turningOff = toggle && item.toggleOn;
  let reason = '', kind = 'ready';
  if (!item) { reason = '빈 슬롯'; kind = 'empty'; }
  else if (!connected) { reason = '연결 대기'; kind = 'unavailable'; }
  else if (!item.enabled) { reason = '사용 불가'; kind = 'unavailable'; }
  else if (!item.useContexts?.includes(inCombat ? 'combat' : 'nonCombat')) { reason = inCombat ? '전투 외에만 사용' : '전투 중에만 사용'; kind = 'unavailable'; }
  else if (state.hp <= 0) { reason = '사용 불가'; kind = 'unavailable'; }
  else if (state.actionLocked) { reason = '매혹·지배 중 조작 불가'; kind = 'unavailable'; }
  else if (toggle && item.toggleConsumesCycle === null) { reason = 'ON/OFF 주기 정책 미정'; kind = 'unavailable'; }
  else if (inCombat && state.battle.pendingSkill && (!toggle || item.toggleConsumesCycle)) { reason = state.battle.pendingSkill.itemId === item.id ? '다음 행동에 예약됨 · 일반 공격 대체' : '다른 스킬 예약 중'; kind = state.battle.pendingSkill.itemId === item.id ? 'queued' : 'used'; }
  else if (inCombat && item.remainingUses === 0 && !turningOff) { reason = '이번 전투 사용 횟수 소진'; kind = 'exhausted'; }
  else if (inCombat && state.battle.skillUsed && (!toggle || item.toggleConsumesCycle)) { reason = '이번 주기 사용 완료'; kind = 'used'; }
  else if (['cleanse','dispel'].includes(item.effectType) && !(state.statusEffects?.[item.effectType === 'cleanse' ? 'hero' : 'enemy'] || []).some(s=>s.polarity===(item.effectType === 'cleanse' ? 'debuff' : 'buff'))) { reason='제거할 상태 없음'; kind='unavailable'; }
  else if (item.effectType === 'heal' && state.hp >= state.stats.maxHp) { reason = '체력 가득 참'; kind = 'unavailable'; }
  else if (item.effectType === 'heal' && !(item.heal > 0)) { reason = '회복량 없음'; kind = 'unavailable'; }
  else reason = toggle ? (turningOff ? 'OFF로 전환' : 'ON으로 전환') : inCombat ? '다음 행동에 예약 가능' : '사용 가능';
  return { kind, reason, remaining, ready: kind === 'ready', progress: 1 };
}
export function initSkills({ bar, slots, summary, status, onUse }) {
  let state = null, serverTime = 0, receivedAt = 0, connected = false, pending = false;
  const views = Array.from({ length: 6 }, (_, index) => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'skill-button'; button.disabled = true;
    button.innerHTML = '<span class="skill-symbol" aria-hidden="true"></span><small class="skill-timer" aria-hidden="true"></small><small class="skill-uses" aria-hidden="true"></small>';
    button.onclick = async () => {
      const item = getItem(index), availability = skillAvailability(state, item, now(), connected);
      if (pending || !availability.ready) return;
      pending = true; refresh();
      try { await onUse(item.id, state.phase === 'BATTLE' ? state.battle.id : null, state.phase === 'BATTLE' ? state.battle.combatants.hero.actionSeq : null, button, item.activationMode, !item.toggleOn); }
      finally { pending = false; refresh(); }
    };
    bar.append(button);
    const slot = document.createElement('div'); slot.className = 'equipped-skill';
    slot.innerHTML = '<span aria-hidden="true"></span><small></small>'; slots.append(slot);
    return { button, slot };
  });
  const now = () => serverTime + Math.max(0, performance.now() - receivedAt);
  const getItem = index => state?.inventory.find(i => i.slot === 'skill' && i.id === state.skillSlots?.[index]);
  function refresh() {
    for (const [index, { button, slot }] of views.entries()) {
      const item = getItem(index), availability = skillAvailability(state, item, now(), connected);
      const description = item ? `${item.name} · ${skillDescription(item)}` : `스킬 슬롯 ${index + 1} · 비어 있음`;
      button.disabled = pending || !availability.ready;
      button.dataset.state = availability.kind;
      button.querySelector('.skill-symbol').innerHTML = skillIconHTML(item || {icon:'＋'});
      button.querySelector('.skill-timer').textContent = availability.kind === 'queued' ? '예약' : availability.kind === 'exhausted' ? '소진' : availability.remaining ? Math.ceil(availability.remaining / 1000) : item?.activationMode === 'toggle' ? (item.toggleOn ? 'ON' : 'OFF') : '';
      button.querySelector('.skill-uses').textContent = item?.remainingUses != null ? `${item.remainingUses}/${item.perBattleLimit}` : '';
      if (item?.activationMode === 'toggle') button.setAttribute('aria-pressed', String(item.toggleOn)); else button.removeAttribute('aria-pressed');
      const label = `${description} · ${availability.reason}${availability.remaining ? ` · ${Math.ceil(availability.remaining / 1000)}초 남음` : ''}`;
      if (button.title !== label) { button.title = label; button.setAttribute('aria-label', label); }
      slot.querySelector('span').innerHTML = skillIconHTML(item || {icon:'＋'}); slot.querySelector('small').textContent = item?.name || `${index + 1}`;
      slot.classList.toggle('empty', !item); slot.title = description;
    }
    if (!state) return;
    const effects = document.getElementById('combat-status-effects');
    if (effects) effects.innerHTML = ['hero','enemy'].map(actor=>`<div class="status-actor"><strong>${actor==='hero'?'모험가':'몬스터'}</strong>${(state.statusEffects?.[actor] || []).map(s=>`<span class="status-effect ${s.polarity}" title="${esc(s.englishName)} · ${esc(s.description || '')} · ${s.attribute || 'DEF'} ${s.tier}단계">${esc(s.name)}${s.id==='mirrored-image'?` +${s.bonus}`:''} <small>${(s.remainingMs/1000).toFixed(1)}초</small></span>`).join('') || '<small>상태 효과 없음</small>'}</div>`).join('');
    const equipped = views.map((_, index) => getItem(index)).filter(Boolean);
    summary.textContent = equipped.length ? equipped.map(item => `${item.name}: ${skillDescription(item)}`).join(' · ') : '가방의 스킬 탭에서 장착해 주세요.';
    const b = state.battle;
    status.textContent = state.phase === 'BATTLE' && b
      ? `개인 행동 주기 ${b.combatants.hero.actionSeq} · ${b.pendingSkill ? '스킬 예약됨 · 다음 일반 공격 대체' : b.skillUsed ? '이번 주기 스킬 사용 완료' : '다음 행동에 스킬 1개 예약 가능'} · ` + ['hero','enemy'].map(actor => {
        const t = state.battleTiming?.[actor];
        return t ? `${actor === 'hero' ? '모험가' : '몬스터'}: 속도 ${Number(t.actionSpeed.toFixed(2))}, 갑옷 -${Math.round((t.armorSpeedPenaltyRate ?? t.actionSpeedPenaltyRate) * 100)}%, 무기 -${Math.round((t.weaponSpeedPenaltyRate || 0) * 100)}%, 준비 ${Math.min(100, Math.floor(t.readiness * 100))}% (${(t.nextActionMs / 1000).toFixed(2)} 게임초)` : '';
      }).join(' / ')
      : '전투 중 스킬을 예약하면 다음 행동에 일반 공격 대신 발동';
  }
  setInterval(() => { if (!document.hidden) refresh(); }, 100);
  return { update(next, time, at, online) { state = next; serverTime = time; receivedAt = at; connected = online; refresh(); }, disconnect() { connected = false; refresh(); } };
}
export const skillIconHTML = item => `<span class="skill-item-icon" aria-hidden="true">${/^\/assets\/skills\/[a-z0-9-]+\.webp$/.test(item.iconPath || '') ? `<img src="${esc(item.iconPath)}" alt="" loading="lazy">` : esc(item.icon || '✦')}</span>`;
