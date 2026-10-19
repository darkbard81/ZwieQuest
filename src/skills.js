import { activeCharacter } from './characters.js';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { EQUIPMENT_CATALOG } from './equipment.js';

export function validateSkillCatalog(catalog) {
  const fail = message => { throw Error(`skills.json: ${message}`); };
  if (catalog.schemaVersion !== 2 || catalog.maxEquipped !== 6 || !Array.isArray(catalog.skills)) fail('schemaVersion=2, maxEquipped=6 and skills array required');
  const ids = new Set();
  for (const s of catalog.skills) {
    if (!/^[a-z][a-z0-9-]*$/.test(s.id) || ids.has(s.id)) fail('unique skill id required');
    ids.add(s.id);
    for (const key of ['name', 'icon', 'description']) if (typeof s[key] !== 'string' || !s[key].trim()) fail(`${s.id}.${key} required`);
    for (const key of ['enabled', 'grantOnCreate', 'equipByDefault']) if (typeof s[key] !== 'boolean') fail(`${s.id}.${key} must be boolean`);
    if (!Array.isArray(s.useContexts) || !s.useContexts.length || new Set(s.useContexts).size !== s.useContexts.length || s.useContexts.some(c => !['combat', 'nonCombat'].includes(c))) fail(`${s.id}: invalid useContexts`);
    if (!['direct', 'toggle'].includes(s.activationMode)) fail(`${s.id}: invalid activationMode`);
    if (s.perBattleLimit !== null && (!Number.isSafeInteger(s.perBattleLimit) || s.perBattleLimit < 1)) fail(`${s.id}: perBattleLimit must be positive or null`);
    for (const [key, value] of Object.entries({ baseMs: s.cooldown?.baseMs, dexterityReductionRate: s.cooldown?.dexterityReductionRate, minimumMs: s.cooldown?.minimumMs })) {
      if (!Number.isFinite(value) || value < 0) fail(`${s.id}.${key} must be nonnegative and finite`);
    }
    if (s.cooldown.minimumMs > s.cooldown.baseMs) fail(`${s.id}: invalid minimum cooldown`);
    if (s.effect?.type === 'heal' && s.activationMode === 'direct') {
      for (const key of ['maxHpRate', 'intelligenceRate']) if (!Number.isFinite(s.effect[key]) || s.effect[key] < 0) fail(`${s.id}: invalid ${key}`);
      if (s.effect.maxHpRate > 1) fail(`${s.id}: invalid healing rate`);
    } else if (s.effect?.type === 'accuracyBonus' && s.activationMode === 'toggle') {
      if (!Number.isFinite(s.effect.amount) || s.effect.amount < 0) fail(`${s.id}: invalid accuracy amount`);
      if (!Array.isArray(s.effect.weaponCategories) || !s.effect.weaponCategories.length || s.effect.weaponCategories.some(id => !EQUIPMENT_CATALOG.weapons.some(w => w.id === id))) fail(`${s.id}: invalid weapon category`);
      if (s.useContexts.length !== 1 || s.useContexts[0] !== 'combat') fail(`${s.id}: accuracy toggle currently supports combat only`);
      if (s.toggleConsumesTurn !== null && typeof s.toggleConsumesTurn !== 'boolean') fail(`${s.id}: toggleConsumesTurn must be boolean or null (unresolved)`);
    } else fail(`${s.id}: unsupported effect/mode; add a server handler first`);
  }
  return catalog;
}
export const SKILL_CATALOG = validateSkillCatalog(JSON.parse(readFileSync(new URL('../data-templates/skills.json', import.meta.url), 'utf8')));
export const skillDefinition = (id, catalog = SKILL_CATALOG) => catalog.skills.find(s => s.id === id);

// This migration runs only once per legacy battle. Events are oldest-first and
// contain the retained battle-start marker; accepted old heals are counted.
export function initializeBattleSkills(battle, events) {
  if (!battle) return;
  if (!battle.skillUseCounts) {
    const start = events?.findLastIndex(e => e.type === 'battle') ?? -1;
    const count = start >= 0 ? events.slice(start + 1).filter(e => e.type === 'skill' && e.skillId === 'heal').length : events ? 2 : battle.skillUsed ? 1 : 0;
    battle.skillUseCounts = count ? { heal: count } : {};
  }
  battle.skillToggles ||= {};
}
// Learned skills and cooldowns belong to one character. Per-battle state is
// initialized only at battle creation or one-time legacy migration, not per turn.
const owner = state => state.characters ? activeCharacter(state) : state;
const learned = state => state.characters ? owner(state)?.skills || [] : state.inventory;
export function initializeSkills(state, catalog = SKILL_CATALOG) {
  if (!owner(state)) return;
  owner(state).skillSlots ||= Array(catalog.maxEquipped).fill(null);
  owner(state).skillCooldowns ||= {};
  owner(state).skillGrants ||= [];
  initializeBattleSkills(state.battle);
  for (const def of catalog.skills.filter(s => s.enabled && s.grantOnCreate)) {
    if (owner(state).skillGrants.includes(def.id)) continue;
    let item = learned(state).find(i => i.slot === 'skill' && i.templateId === def.id);
    if (!item) {
      item = { id: randomUUID(), templateId: def.id, slot: 'skill', name: def.name, stats: {} };
      learned(state).push(item);
      const empty = owner(state).skillSlots.indexOf(null);
      if (def.equipByDefault && empty !== -1) owner(state).skillSlots[empty] = item.id;
    }
    owner(state).skillGrants.push(def.id);
  }
}
export function skillValues(def, hero) {
  return {
    ...(def.effect.type === 'heal' ? { heal: Math.max(0, Math.floor(hero.maxHp * (def.effect.maxHpRate + hero.INT * def.effect.intelligenceRate))) } : { accuracyBonus: def.effect.amount }),
    cooldownMs: Math.max(def.cooldown.minimumMs, Math.round(def.cooldown.baseMs * (1 - hero.DEX * def.cooldown.dexterityReductionRate)))
  };
}
export function skillItemView(item, state, hero, catalog = SKILL_CATALOG) {
  const def = skillDefinition(item.templateId, catalog), inCombat = state.phase === 'BATTLE';
  const used = inCombat ? state.battle?.skillUseCounts?.[item.templateId] || 0 : 0;
  return { ...item, name: def?.name || item.name, icon: def?.icon || '?', description: def?.description || '등록되지 않은 스킬입니다.', enabled: !!def?.enabled,
    useContexts: def?.useContexts || [], activationMode: def?.activationMode, effectType: def?.effect.type, perBattleLimit: def?.perBattleLimit ?? null,
    usesThisBattle: used, remainingUses: inCombat && def?.perBattleLimit != null ? Math.max(0, def.perBattleLimit - used) : null,
    toggleOn: inCombat && !!state.battle?.skillToggles?.[item.templateId], toggleConsumesTurn: def?.toggleConsumesTurn ?? null,
    ...(def ? skillValues(def, hero) : {}), cooldown: owner(state).skillCooldowns[item.templateId] || null };
}
export function equipSkill(state, item, unequip = false, slotIndex, catalog = SKILL_CATALOG) {
  if (!owner(state) || !learned(state).some(i => i.id === item.id)) throw Error('이 캐릭터가 습득한 스킬이 아닙니다.');
  const current = owner(state).skillSlots.indexOf(item.id);
  if (unequip) {
    if (current === -1) throw Error('장착 중인 스킬이 아닙니다.');
    owner(state).skillSlots[current] = null; return;
  }
  if (!skillDefinition(item.templateId, catalog)?.enabled) throw Error('사용할 수 없는 스킬입니다.');
  if (slotIndex !== undefined && (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= catalog.maxEquipped)) throw Error('스킬 슬롯은 1~6번입니다.');
  if (current !== -1 && slotIndex === undefined) return;
  const target = slotIndex ?? owner(state).skillSlots.indexOf(null);
  if (target === -1) throw Error('스킬은 최대 6개까지 장착할 수 있습니다. 먼저 해제해 주세요.');
  if (current !== -1) owner(state).skillSlots[current] = null;
  owner(state).skillSlots[target] = item.id;
}
function validateUse(state, item, command, catalog, consumesTurn) {
  if (!owner(state) || !item || !learned(state).some(i => i.id === item.id) || item.slot !== 'skill' || !owner(state).skillSlots.includes(item.id)) throw Error('장착 중인 스킬을 선택하세요.');
  const def = skillDefinition(item.templateId, catalog);
  if (!def?.enabled) throw Error('사용할 수 없는 스킬입니다.');
  const b = state.phase === 'BATTLE' ? state.battle : null;
  if (!def.useContexts.includes(b ? 'combat' : 'nonCombat')) throw Error(b ? '전투 외에 사용하는 스킬입니다.' : '스킬은 전투 중에만 사용할 수 있습니다.');
  if (owner(state).hp <= 0 || (b && state.enemy?.hp <= 0)) throw Error('지금은 스킬을 사용할 수 없습니다.');
  // Prevent a stale non-combat request from executing after a battle starts, or vice versa.
  if ((b?.id ?? null) !== (command.battleId ?? null) || (b && command.turn !== b.turn)) throw Error('스킬을 선택한 턴이 지났습니다.');
  if (b && (b.actor !== 'hero' || b.ap <= 0)) throw Error('자신의 턴에만 스킬을 사용할 수 있습니다.');
  if (b && consumesTurn && b.skillUsed) throw Error('이번 턴에는 이미 스킬을 사용했습니다.');
  return { def, b };
}
function checkActivation(state, def, b, now) {
  if (b && def.perBattleLimit !== null && (b.skillUseCounts?.[def.id] || 0) >= def.perBattleLimit) throw Error(`전투당 ${def.perBattleLimit}회 사용을 모두 소진했습니다.`);
  if ((owner(state).skillCooldowns[def.id]?.readyAt || 0) > now) throw Error('스킬 재사용 대기 중입니다.');
}
function recordActivation(state, def, b, values, now, consumesTurn) {
  if (b) {
    b.skillUseCounts ||= {};
    b.skillUseCounts[def.id] = (b.skillUseCounts[def.id] || 0) + 1;
    if (consumesTurn) b.skillUsed = true;
  }
  owner(state).skillCooldowns[def.id] = { startedAt: now, readyAt: now + values.cooldownMs, durationMs: values.cooldownMs };
}
export function useSkill(state, item, hero, command, now = Date.now(), catalog = SKILL_CATALOG) {
  const { def, b } = validateUse(state, item, command, catalog, true);
  if (def.activationMode !== 'direct') throw Error('유지형 스킬은 ON/OFF로 조작하세요.');
  checkActivation(state, def, b, now);
  const values = skillValues(def, hero);
  const healed = Math.min(values.heal, Math.max(0, hero.maxHp - owner(state).hp));
  if (!healed) throw Error('회복할 체력이 없습니다.');
  owner(state).hp += healed;
  recordActivation(state, def, b, values, now, true);
  return { skillId: def.id, name: def.name, healed, ...values, round: b?.turn ?? null, battleId: b?.id ?? null };
}
export function toggleSkill(state, item, hero, command, now = Date.now(), catalog = SKILL_CATALOG) {
  const def = skillDefinition(item?.templateId, catalog);
  if (!def?.enabled || def.activationMode !== 'toggle') throw Error('사용할 수 없는 유지형 스킬입니다.');
  if (def.toggleConsumesTurn === null) throw Error('ON/OFF 전환의 턴 사용 정책이 아직 정해지지 않았습니다.');
  if (typeof command.enabled !== 'boolean') throw Error('ON/OFF 상태를 지정하세요.');
  const { b } = validateUse(state, item, command, catalog, def.toggleConsumesTurn);
  if (!!b.skillToggles?.[def.id] === command.enabled) return null;
  const values = skillValues(def, hero);
  if (command.enabled) { checkActivation(state, def, b, now); recordActivation(state, def, b, values, now, def.toggleConsumesTurn); }
  else if (def.toggleConsumesTurn) b.skillUsed = true;
  b.skillToggles ||= {}; b.skillToggles[def.id] = command.enabled;
  return { skillId: def.id, name: def.name, enabled: command.enabled, round: b.turn, battleId: b.id };
}
// Recompute from equipped templates each time; never mutate base stats or stack
// a bonus on a previously boosted snapshot. Duplicate copies count only once.
export function maintainedSkillBonuses(state, catalog = SKILL_CATALOG) {
  const bonus = { ACC: 0 };
  if (!owner(state) || state.phase !== 'BATTLE' || !state.battle || owner(state).hp <= 0 || state.enemy?.hp <= 0) return bonus;
  const weapon = state.inventory.find(i => i.slot === 'weapon' && i.id === owner(state).equipment.weapon);
  const applied = new Set();
  for (const id of owner(state).skillSlots || []) {
    const item = learned(state).find(i => i.slot === 'skill' && i.id === id);
    const def = skillDefinition(item?.templateId, catalog);
    if (!def?.enabled || def.activationMode !== 'toggle' || !def.useContexts.includes('combat') || !state.battle.skillToggles?.[def.id] || applied.has(def.id)) continue;
    applied.add(def.id);
    if (def.effect.type === 'accuracyBonus' && def.effect.weaponCategories.includes(weapon?.templateId)) bonus.ACC += def.effect.amount;
  }
  return bonus;
}
