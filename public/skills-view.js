const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function skillDescription(item) {
  if (!item.enabled) return '사용할 수 없는 스킬';
  const effect = item.activationMode === 'toggle' ? `유지 효과 · 명중 +${item.accuracyBonus} · ${item.toggleOn ? 'ON' : 'OFF'}` : `HP ${item.heal} 회복`;
  const limit = item.perBattleLimit == null ? '전투당 제한 없음' : item.remainingUses == null ? `전투당 ${item.perBattleLimit}회` : `남은 ${item.remainingUses}/${item.perBattleLimit}회${item.remainingUses === 0 ? ' · 소진' : ''}`;
  const context = item.useContexts?.length === 2 ? '전투/비전투' : item.useContexts?.includes('nonCombat') ? '비전투' : '전투';
  return `${effect} · 재사용 ${Number((item.cooldownMs / 1000).toFixed(2))}초 · ${context} · ${limit}`;
}
export function skillAvailability(state, item, now, connected = true) {
  const remaining = Math.max(0, (item?.cooldown?.readyAt || 0) - now);
  const inCombat = state?.phase === 'BATTLE', toggle = item?.activationMode === 'toggle', turningOff = toggle && item.toggleOn;
  let reason = '', kind = 'ready';
  if (!item) { reason = '빈 슬롯'; kind = 'empty'; }
  else if (!connected) { reason = '연결 대기'; kind = 'unavailable'; }
  else if (!item.enabled) { reason = '사용 불가'; kind = 'unavailable'; }
  else if (!item.useContexts?.includes(inCombat ? 'combat' : 'nonCombat')) { reason = inCombat ? '전투 외에만 사용' : '전투 중에만 사용'; kind = 'unavailable'; }
  else if (state.hp <= 0) { reason = '사용 불가'; kind = 'unavailable'; }
  else if (toggle && item.toggleConsumesTurn === null) { reason = 'ON/OFF 턴 정책 미정'; kind = 'unavailable'; }
  else if (inCombat && item.remainingUses === 0 && !turningOff) { reason = '이번 전투 사용 횟수 소진'; kind = 'exhausted'; }
  else if (inCombat && state.battle?.actor !== 'hero') { reason = '상대 턴'; kind = 'unavailable'; }
  else if (inCombat && state.battle.skillUsed && (!toggle || item.toggleConsumesTurn)) { reason = '이번 턴 사용 완료'; kind = 'used'; }
  else if (remaining > 0 && !turningOff) { reason = '재사용 대기'; kind = 'cooldown'; }
  else if (item.effectType === 'heal' && state.hp >= state.stats.maxHp) { reason = '체력 가득 참'; kind = 'unavailable'; }
  else if (item.effectType === 'heal' && !(item.heal > 0)) { reason = '회복량 없음'; kind = 'unavailable'; }
  else reason = toggle ? (turningOff ? 'OFF로 전환' : 'ON으로 전환') : '사용 가능';
  return { kind, reason, remaining, ready: kind === 'ready', progress: remaining ? Math.max(0, Math.min(1, 1 - remaining / item.cooldown.durationMs)) : 1 };
}
export function initSkills({ bar, slots, summary, status, onUse }) {
  let state = null, serverTime = 0, receivedAt = 0, connected = false, pending = false;
  const views = Array.from({ length: 6 }, (_, index) => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'skill-button'; button.disabled = true;
    button.innerHTML = '<span class="skill-symbol" aria-hidden="true"></span><span class="skill-shade" aria-hidden="true"></span><small class="skill-timer" aria-hidden="true"></small><small class="skill-uses" aria-hidden="true"></small>';
    button.onclick = async () => {
      const item = getItem(index), availability = skillAvailability(state, item, now(), connected);
      if (pending || !availability.ready) return;
      pending = true; refresh();
      try { await onUse(item.id, state.phase === 'BATTLE' ? state.battle.id : null, state.phase === 'BATTLE' ? state.battle.turn : null, button, item.activationMode, !item.toggleOn); }
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
      button.style.setProperty('--cooldown-angle', `${availability.progress * 360}deg`);
      button.querySelector('.skill-symbol').textContent = item?.icon || '＋';
      button.querySelector('.skill-timer').textContent = availability.kind === 'exhausted' ? '소진' : availability.remaining ? Math.ceil(availability.remaining / 1000) : item?.activationMode === 'toggle' ? (item.toggleOn ? 'ON' : 'OFF') : '';
      button.querySelector('.skill-uses').textContent = item?.remainingUses != null ? `${item.remainingUses}/${item.perBattleLimit}` : '';
      if (item?.activationMode === 'toggle') button.setAttribute('aria-pressed', String(item.toggleOn)); else button.removeAttribute('aria-pressed');
      const label = `${description} · ${availability.reason}${availability.remaining ? ` · ${Math.ceil(availability.remaining / 1000)}초 남음` : ''}`;
      if (button.title !== label) { button.title = label; button.setAttribute('aria-label', label); }
      slot.querySelector('span').textContent = item?.icon || '＋'; slot.querySelector('small').textContent = item?.name || `${index + 1}`;
      slot.classList.toggle('empty', !item); slot.title = description;
    }
    if (!state) return;
    const equipped = views.map((_, index) => getItem(index)).filter(Boolean);
    summary.textContent = equipped.length ? equipped.map(item => `${item.name}: ${skillDescription(item)}`).join(' · ') : '가방의 스킬 탭에서 장착해 주세요.';
    const b = state.battle;
    status.textContent = state.phase === 'BATTLE' && b
      ? `라운드 ${b.turn} · ${b.actor === 'hero' ? '모험가' : '몬스터'} 턴 · AP ${b.ap}/3 · ${b.skillUsed ? '이번 턴 스킬 사용 완료' : '자기 턴에 스킬 1개 사용 가능'}`
      : '전투 중 자기 턴에 수동 사용 · AP 소모 없음';
  }
  setInterval(() => { if (!document.hidden) refresh(); }, 100);
  return { update(next, time, at, online) { state = next; serverTime = time; receivedAt = at; connected = online; refresh(); }, disconnect() { connected = false; refresh(); } };
}
export const skillIconHTML = item => `<span class="skill-item-icon" aria-hidden="true">${esc(item.icon || '💚')}</span>`;
