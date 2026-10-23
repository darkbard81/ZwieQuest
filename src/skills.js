import { statusDefinition, modifiers, durationMs, resolveDurationMultiplier, applyStatus, applyMirror, clearStatuses, polarityOf } from './status-effects.js';
import { activeCharacter } from './characters.js';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { EQUIPMENT_CATALOG } from './equipment.js';

export function validateSkillCatalog(catalog) {
  const fail = message => { throw Error(`skills.json: ${message}`); };
  if (catalog.schemaVersion !== 3 || catalog.maxEquipped !== 6 || !Array.isArray(catalog.skills)) fail('schemaVersion=3, maxEquipped=6 and skills array required');
  const ids = new Set();
  for (const s of catalog.skills) {
    if (!/^[a-z][a-z0-9-]*$/.test(s.id) || ids.has(s.id)) fail('unique skill id required');
    ids.add(s.id);
    for (const key of ['name', 'icon', 'description']) if (typeof s[key] !== 'string' || !s[key].trim()) fail(`${s.id}.${key} required`);
    for (const key of ['enabled', 'grantOnCreate', 'equipByDefault']) if (typeof s[key] !== 'boolean') fail(`${s.id}.${key} must be boolean`);
    if (!Array.isArray(s.useContexts) || !s.useContexts.length || new Set(s.useContexts).size !== s.useContexts.length || s.useContexts.some(c => !['combat', 'nonCombat'].includes(c))) fail(`${s.id}: invalid useContexts`);
    if (!['direct', 'toggle'].includes(s.activationMode)) fail(`${s.id}: invalid activationMode`);
    if (s.perBattleLimit !== null && (!Number.isSafeInteger(s.perBattleLimit) || s.perBattleLimit < 1)) fail(`${s.id}: perBattleLimit must be positive or null`);
    if (s.effect?.type === 'heal' && s.activationMode === 'direct') {
      for (const key of ['maxHpRate', 'intelligenceRate']) if (!Number.isFinite(s.effect[key]) || s.effect[key] < 0) fail(`${s.id}: invalid ${key}`);
      if (s.effect.maxHpRate > 1) fail(`${s.id}: invalid healing rate`);
    } else if (s.effect?.type === 'accuracyBonus' && s.activationMode === 'toggle') {
      if (!Number.isFinite(s.effect.amount) || s.effect.amount < 0) fail(`${s.id}: invalid accuracy amount`);
      if (!Array.isArray(s.effect.weaponCategories) || !s.effect.weaponCategories.length || s.effect.weaponCategories.some(id => !EQUIPMENT_CATALOG.weapons.some(w => w.id === id))) fail(`${s.id}: invalid weapon category`);
      if (s.useContexts.length !== 1 || s.useContexts[0] !== 'combat') fail(`${s.id}: accuracy toggle currently supports combat only`);
      if (s.toggleConsumesCycle !== null && typeof s.toggleConsumesCycle !== 'boolean') fail(`${s.id}: toggleConsumesCycle must be boolean or null (unresolved)`);
    } else if (s.effect?.type === 'equipmentMastery' && s.activationMode === 'toggle') {
      const e=s.effect, categories=e.equipmentSlot==='weapon'?EQUIPMENT_CATALOG.weaponCategories:e.equipmentSlot==='armor'?EQUIPMENT_CATALOG.armorCategories:null;
      if (!categories?.[e.category] || e.category==='natural') fail(`${s.id}: invalid mastery category`);
      if (!Number.isInteger(e.accuracyBonus) || Math.abs(e.accuracyBonus)>20 || ['actionSpeedRate','damageRate'].some(k=>!Number.isFinite(e[k]) || e[k]<-.5 || e[k]>1)) fail(`${s.id}: invalid mastery bonus`);
      if (e.defenseBonus !== undefined && (!Number.isInteger(e.defenseBonus) || Math.abs(e.defenseBonus) > 20)) fail(`${s.id}: invalid mastery defense bonus`);
      if (s.useContexts.length!==2 || !s.useContexts.includes('combat') || !s.useContexts.includes('nonCombat') || s.perBattleLimit!==null || s.toggleConsumesCycle!==false) fail(`${s.id}: invalid mastery activation`);
    } else if (s.activationMode === 'direct' && ['attack','status','mirror','cleanse','dispel'].includes(s.effect?.type)) {
      if (['attack','status','mirror'].includes(s.effect.type) && !(Number.isFinite(s.effect.durationMs) && s.effect.durationMs > 0)) fail(`${s.id}: invalid duration`);
      if (['attack','status'].includes(s.effect.type) && !statusDefinition(s.effect.statusId)) fail(`${s.id}: unknown status`);
      if (s.effect.type === 'attack') {
        if (!['DEF','REF','FOR','WIL'].includes(s.effect.statusDefense)) fail(`${s.id}: invalid status defense`);
        for (const k of ['damageMultiplier','accuracyBonus','penetrationBonus']) if (!Number.isFinite(s.effect[k]) || s.effect[k] < 0) fail(`${s.id}: invalid ${k}`);
      }
    } else fail(`${s.id}: unsupported effect/mode; add a server handler first`);
    if (s.enabled && !/^\/assets\/skills\/[a-z0-9-]+\.webp$/.test(s.iconPath || '')) fail(`${s.id}: invalid iconPath`);
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
// Learned skills are shared by the account. Slots and preferences remain per character.
// Per-battle state is initialized only at battle creation or legacy migration.
const owner = state => state.characters ? activeCharacter(state) : state;
const learned = state => state.characters ? owner(state)?.skills || [] : state.inventory;
// Equipment mastery preferences belong to the character, including outside battle.
const toggleOwner = (state, def) => def?.effect.type === 'equipmentMastery' ? owner(state) : state.phase === 'BATTLE' ? state.battle : null;
const retiredSkillIds = new Set(['purify', 'dispel']);
function removeRetiredSkills(state) {
  const characters = state.characters || [state];
  const removedItems = new Set();
  for (const list of [state.sharedSkills, ...characters.map(c => state.characters ? c.skills : c.inventory)]) {
    if (!Array.isArray(list)) continue;
    for (let i = list.length - 1; i >= 0; i--) if (list[i].slot === 'skill' && retiredSkillIds.has(list[i].templateId)) {
      removedItems.add(list[i].id); list.splice(i, 1);
    }
  }
  for (const c of characters) {
    if (c.skillSlots) c.skillSlots = c.skillSlots.map(id => removedItems.has(id) ? null : id);
    if (c.skillGrants) c.skillGrants = c.skillGrants.filter(id => !retiredSkillIds.has(id));
    for (const id of retiredSkillIds) if (c.skillToggles) delete c.skillToggles[id];
  }
  if (retiredSkillIds.has(state.battle?.pendingSkill?.skillId) || removedItems.has(state.battle?.pendingSkill?.itemId)) delete state.battle.pendingSkill;
  for (const counts of [state.battle?.skillUseCounts, state.battle?.enemySkillUseCounts, state.battle?.skillToggles]) {
    if (counts) for (const id of retiredSkillIds) delete counts[id];
  }
  if (state.enemy?.skills) state.enemy.skills = state.enemy.skills.filter(id => !retiredSkillIds.has(id));
}
export function initializeSkills(state, catalog = SKILL_CATALOG) {
  removeRetiredSkills(state);
  if (!owner(state)) return;
  owner(state).skillSlots ||= Array(catalog.maxEquipped).fill(null);
  owner(state).autoSkills = owner(state).autoSkills === true;
  owner(state).skillCooldowns = {}; // Retired wall-clock cooldowns never survive migration.
  owner(state).skillGrants ||= [];
  if (!skillDefinition('dagger-mastery',catalog)?.enabled && catalog.skills.some(d=>d.id==='light-weapon-mastery' && d.enabled)) {
    const old=learned(state).find(i=>i.templateId==='dagger-mastery'), current=learned(state).find(i=>i.templateId==='light-weapon-mastery');
    if(old){if(current){owner(state).skillSlots=owner(state).skillSlots.map(id=>id===old.id?(owner(state).skillSlots.includes(current.id)?null:current.id):id);const list=learned(state);list.splice(list.indexOf(old),1);}else{old.templateId='light-weapon-mastery';old.name=skillDefinition('light-weapon-mastery',catalog).name;}
      if(state.battle?.skillToggles?.['dagger-mastery'])state.battle.skillToggles['light-weapon-mastery']=true;
      if(state.battle?.skillToggles)delete state.battle.skillToggles['dagger-mastery'];
    }
  }
  initializeBattleSkills(state.battle);
  owner(state).skillToggles ||= {};
  for (const def of catalog.skills.filter(s => s.effect.type === 'equipmentMastery')) {
    // Preserve explicit OFF and consume legacy battle entries so they cannot revive later.
    if (!Object.hasOwn(owner(state).skillToggles, def.id) && typeof state.battle?.skillToggles?.[def.id] === 'boolean') {
      owner(state).skillToggles[def.id] = state.battle.skillToggles[def.id];
    }
    if (state.battle?.skillToggles) delete state.battle.skillToggles[def.id];
  }
  for (const item of learned(state)) {
    const def = skillDefinition(item.templateId, catalog);
    if (def) item.name = def.name;
  }
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
// Merge old per-character discoveries without changing independent loadouts. Keep
// character.skills as a compatibility view of the account library in memory.
export function initializeSharedSkills(state, catalog = SKILL_CATALOG) {
  removeRetiredSkills(state);
  const byTemplate = new Map(), aliases = new Map();
  const sources = [...(state.sharedSkills || []), ...state.characters.flatMap(c => c.skills || [])];
  for (const item of sources) {
    if (item.slot !== 'skill') continue;
    const templateId = item.templateId === 'dagger-mastery' && !skillDefinition('dagger-mastery', catalog)?.enabled && skillDefinition('light-weapon-mastery', catalog)?.enabled ? 'light-weapon-mastery' : item.templateId;
    let canonical = byTemplate.get(templateId);
    if (!canonical) {
      canonical = { ...item, templateId, name: skillDefinition(templateId, catalog)?.name || item.name };
      byTemplate.set(templateId, canonical);
    }
    aliases.set(item.id, canonical.id);
  }
  state.sharedSkills = [...byTemplate.values()];
  for (const c of state.characters) {
    const used = new Set();
    c.skillSlots = c.skillSlots.map(id => {
      const canonical = aliases.get(id);
      if (!canonical || used.has(canonical)) return null;
      used.add(canonical); return canonical;
    });
    c.skills = state.sharedSkills;
  }
  const pending = state.battle?.pendingSkill;
  if (pending && aliases.has(pending.itemId)) {
    pending.itemId = aliases.get(pending.itemId);
    pending.skillId = state.sharedSkills.find(i => i.id === pending.itemId).templateId;
  }
}
export function skillValues(def, hero) {
  return { ...(def.effect.type === 'heal' ? { heal: Math.max(0, Math.floor(hero.maxHp * (def.effect.maxHpRate + hero.INT * def.effect.intelligenceRate))) } : def.effect.type === 'accuracyBonus' ? { accuracyBonus: def.effect.amount } : {}),
    ...(def.effect.durationMs ? { durationMs: durationMs(def.effect.durationMs, hero.INT) } : {}) };
}
export function grantTreasureSkill(state, rng, catalog = SKILL_CATALOG) {
  const known = new Set(learned(state).map(i=>i.templateId));
  const candidates = catalog.skills.filter(d=>d.enabled && d.treasureDrop && !known.has(d.id));
  if (!candidates.length) return null;
  const def=candidates[((rng(candidates.length) % candidates.length) + candidates.length) % candidates.length], item={id:randomUUID(),templateId:def.id,slot:'skill',name:def.name,stats:{}};
  learned(state).push(item); return item;
}
export function skillItemView(item, state, hero, catalog = SKILL_CATALOG) {
  const def = skillDefinition(item.templateId, catalog), inCombat = state.phase === 'BATTLE';
  const used = inCombat ? state.battle?.skillUseCounts?.[item.templateId] || 0 : 0;
  const values = def ? skillValues(def, hero) : {};
  if (def?.effect.type === 'attack' && inCombat) values.durationMs *= resolveDurationMultiplier((state.enemy?.RES || 0) + (modifiers(state.battle, 'enemy').RES || 0)) * modifiers(state.battle, 'hero').debuffDurationMultiplier * modifiers(state.battle, 'enemy').hostileDurationMultiplier;
  return { ...item, name: def?.name || item.name, icon: def?.icon || '?', iconPath: def?.iconPath, effect: def?.effect, statusName: statusDefinition(def?.effect.statusId)?.name, statusDescription: statusDefinition(def?.effect.statusId)?.description, description: def?.description || '등록되지 않은 스킬입니다.', enabled: !!def?.enabled,
    useContexts: def?.useContexts || [], activationMode: def?.activationMode, effectType: def?.effect.type, perBattleLimit: def?.perBattleLimit ?? null,
    usesThisBattle: used, remainingUses: inCombat && def?.perBattleLimit != null ? Math.max(0, def.perBattleLimit - used) : null,
    masteryMatches: def?.effect.type === 'equipmentMastery' ? masteryMatches(state, def.effect) : true,
    toggleOn: !!toggleOwner(state, def)?.skillToggles?.[item.templateId], toggleConsumesCycle: def?.toggleConsumesCycle ?? null,
    ...values, ...(def?.effect.type === 'heal' ? { heal: Math.floor(skillValues(def, hero).heal * modifiers(state.battle, 'hero').healingReceived) } : {}) };
}
export function equipSkill(state, item, unequip = false, slotIndex, catalog = SKILL_CATALOG) {
  if (!owner(state) || !learned(state).some(i => i.id === item.id)) throw Error('이 계정이 습득한 스킬이 아닙니다.');
  const current = owner(state).skillSlots.findIndex(id => learned(state).some(i => i.id === id && i.templateId === item.templateId));
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
function validateUse(state, item, command, catalog, consumesCycle) {
  if (!owner(state) || !item || !learned(state).some(i => i.id === item.id) || item.slot !== 'skill' || !owner(state).skillSlots.includes(item.id)) throw Error('장착 중인 스킬을 선택하세요.');
  const def = skillDefinition(item.templateId, catalog);
  if (!def?.enabled) throw Error('사용할 수 없는 스킬입니다.');
  const b = state.phase === 'BATTLE' ? state.battle : null;
  if (!def.useContexts.includes(b ? 'combat' : 'nonCombat')) throw Error(b ? '전투 외에 사용하는 스킬입니다.' : '스킬은 전투 중에만 사용할 수 있습니다.');
  if (owner(state).hp <= 0 || (b && state.enemy?.hp <= 0)) throw Error('지금은 스킬을 사용할 수 없습니다.');
  if (b && modifiers(b, 'hero').actionLocked) throw Error('매혹·지배 중에는 스킬을 조작할 수 없습니다.');
  // Prevent a stale non-combat request from executing after a battle starts, or vice versa.
  if ((b?.id ?? null) !== (command.battleId ?? null) || (b && command.heroActionSeq !== b.combatants.hero.actionSeq)) throw Error('스킬을 선택한 행동 주기가 지났습니다.');
  if (b && consumesCycle && (b.skillUsed || b.pendingSkill)) throw Error('이번 행동 주기에는 이미 스킬을 사용했거나 예약했습니다.');
  return { def, b };
}
function checkActivation(state, def, b, now) {
  if (b && def.perBattleLimit !== null && (b.skillUseCounts?.[def.id] || 0) >= def.perBattleLimit) throw Error(`전투당 ${def.perBattleLimit}회 사용을 모두 소진했습니다.`);

}
function recordActivation(state, def, b, values, now, consumesCycle) {
  if (b) {
    b.skillUseCounts ||= {};
    b.skillUseCounts[def.id] = (b.skillUseCounts[def.id] || 0) + 1;
    if (consumesCycle) b.skillUsed = true;
  }

}
function prepareDirectSkill(state, item, hero, command, now, catalog) {
  const { def, b } = validateUse(state, item, command, catalog, true);
  if (def.activationMode !== 'direct') throw Error('유지형 스킬은 ON/OFF로 조작하세요.');
  checkActivation(state, def, b, now);
  const values = skillValues(def, hero);
  const healed = def.effect.type === 'heal' ? Math.min(Math.floor(values.heal * modifiers(b, 'hero').healingReceived), Math.max(0, hero.maxHp - owner(state).hp)) : 0;
  if (def.effect.type === 'heal' && !healed) throw Error('회복할 체력이 없거나 회복이 차단되었습니다.');
  if (['cleanse','dispel'].includes(def.effect.type) && !(b?.statuses?.[def.effect.type === 'cleanse' ? 'hero' : 'enemy'] || []).some(s=>polarityOf(s)===(def.effect.type === 'cleanse' ? 'debuff' : 'buff'))) throw Error('제거할 상태 효과가 없습니다.');
  return { def, b, values, healed, hero };
}
export function applySkillEffect(state, actor, def, source) {
  const b=state.battle, e=def.effect;
  if(e.type==='status')return applyStatus(b,actor,e.statusId,e.durationMs,source,actor,(actor==='hero'?owner(state):state.enemy).statusResistance || {},def.id,source);
  if(e.type==='mirror') { applyMirror(b,actor,e.durationMs,source); return {}; }
  if(e.type==='cleanse' || e.type==='dispel')return { removed:clearStatuses(b,e.type==='cleanse'?actor:(actor==='hero'?'enemy':'hero'),e.type==='cleanse'?'debuff':'buff') };
  return {};
}
function activateDirectSkill(state, { def, b, values, healed, hero }, now) {
  owner(state).hp += healed;
  const effectResult=applySkillEffect(state,'hero',def,hero);
  recordActivation(state, def, b, values, now, true);
  return { skillId: def.id, name: def.name, effect: def.effect, ...effectResult, healed, ...values, heroActionSeq: b?.combatants.hero.actionSeq ?? null, battleId: b?.id ?? null };
}
// A combat request reserves one upcoming hero action. Costs and effects belong
// to execution, so equipment/stat changes are checked again at that boundary.
export function useSkill(state, item, hero, command, now = Date.now(), catalog = SKILL_CATALOG) {
  if (state.phase === 'BATTLE' && owner(state)?.autoSkills) throw Error('자동 스킬 모드입니다. 수동 스킬로 전환해 예약하세요.');
  const prepared = prepareDirectSkill(state, item, hero, command, now, catalog);
  const { def, b } = prepared;
  if (!b) return activateDirectSkill(state, prepared, now);
  b.pendingSkill = { itemId: item.id, skillId: def.id, characterId: owner(state).id,
    battleId: b.id, heroActionSeq: b.combatants.hero.actionSeq };
  return { ...b.pendingSkill, name: def.name, queued: true };
}
export function resolvePendingSkill(state, hero, now = Date.now(), catalog = SKILL_CATALOG) {
  const b = state.battle, pending = b?.pendingSkill;
  if (!pending) return null;
  // Clear before attempting execution: a cancelled reservation cannot retry or
  // carry over to another action. A valid reservation never also attacks.
  delete b.pendingSkill;
  let prepared;
  try {
    if (state.phase !== 'BATTLE' || pending.characterId !== owner(state)?.id || pending.battleId !== b.id) throw Error('예약한 전투 또는 캐릭터가 변경되었습니다.');
    const item = learned(state).find(i => i.id === pending.itemId && i.templateId === pending.skillId);
    prepared = prepareDirectSkill(state, item, hero, pending, now, catalog);
  } catch (error) {
    return { ...pending, cancelled: true, reason: error.message };
  }
  return activateDirectSkill(state, prepared, now);
}
// Choose only after action-time validation. Preparing candidates has no side effects.
export function resolveAutoSkill(state, hero, rng, now = Date.now(), catalog = SKILL_CATALOG) {
  const b = state.battle;
  if (!owner(state)?.autoSkills || state.phase !== 'BATTLE' || !b || modifiers(b, 'hero').actionLocked) return null;
  const candidates = [], seen = new Set();
  for (const id of owner(state).skillSlots) {
    const item = learned(state).find(i => i.id === id);
    const def = skillDefinition(item?.templateId, catalog);
    if (def?.activationMode !== 'direct' || seen.has(def.id)) continue;
    seen.add(def.id);
    try { candidates.push(prepareDirectSkill(state, item, hero, { battleId: b.id, heroActionSeq: b.combatants.hero.actionSeq }, now, catalog)); }
    catch { /* Unavailable skills consume neither an action nor a use. */ }
  }
  if (!candidates.length) return null;
  return { ...activateDirectSkill(state, candidates[rng(candidates.length)], now), automatic: true };
}
export function toggleSkill(state, item, hero, command, now = Date.now(), catalog = SKILL_CATALOG) {
  const def = skillDefinition(item?.templateId, catalog);
  if (!def?.enabled || def.activationMode !== 'toggle') throw Error('사용할 수 없는 유지형 스킬입니다.');
  if (def.toggleConsumesCycle === null) throw Error('ON/OFF 전환의 행동 주기 사용 정책이 아직 정해지지 않았습니다.');
  if (typeof command.enabled !== 'boolean') throw Error('ON/OFF 상태를 지정하세요.');
  const { b } = validateUse(state, item, command, catalog, def.toggleConsumesCycle);
  const target = toggleOwner(state, def);
  if (!!target.skillToggles?.[def.id] === command.enabled) return null;
  const values = skillValues(def, hero);
  if (command.enabled) { checkActivation(state, def, b, now); recordActivation(state, def, b, values, now, def.toggleConsumesCycle); }
  else if (b && def.toggleConsumesCycle) b.skillUsed = true;
  target.skillToggles ||= {}; target.skillToggles[def.id] = command.enabled;
  return { skillId: def.id, name: def.name, enabled: command.enabled, heroActionSeq: b?.combatants.hero.actionSeq ?? null, battleId: b?.id ?? null };
}
function masteryMatches(state, effect) {
  const item=state.inventory.find(i=>i.slot===effect.equipmentSlot && i.id===owner(state)?.equipment[effect.equipmentSlot]);
  return item?.[effect.equipmentSlot==='weapon'?'weaponCategory':'armorCategory']===effect.category;
}
// Recompute from equipped templates each time; never mutate base stats or stack
// a bonus on a previously boosted snapshot. Duplicate copies count only once.
export function maintainedSkillBonuses(state, catalog = SKILL_CATALOG) {
  const bonus = { ACC: 0 };
  if (!owner(state)?.equipment || owner(state).hp <= 0 || (state.phase === 'BATTLE' && (!state.battle || state.enemy?.hp <= 0))) return bonus;
  const weapon = state.inventory.find(i => i.slot === 'weapon' && i.id === owner(state).equipment.weapon);
  const applied = new Set();
  for (const id of owner(state).skillSlots || []) {
    const item = learned(state).find(i => i.slot === 'skill' && i.id === id);
    const def = skillDefinition(item?.templateId, catalog);
    if (!def?.enabled || def.activationMode !== 'toggle' || !def.useContexts.includes(state.phase === 'BATTLE' ? 'combat' : 'nonCombat') || !toggleOwner(state, def)?.skillToggles?.[def.id] || applied.has(def.id)) continue;
    applied.add(def.id);
    if (def.effect.type==='equipmentMastery' && masteryMatches(state,def.effect)) { bonus.ACC+=def.effect.accuracyBonus; if (def.effect.defenseBonus) bonus.DEF=(bonus.DEF||0)+def.effect.defenseBonus; bonus.actionSpeedRate=(bonus.actionSpeedRate||0)+def.effect.actionSpeedRate; bonus.damageRate=(bonus.damageRate||0)+def.effect.damageRate; }
    if (def.effect.type === 'accuracyBonus' && def.effect.weaponCategories.includes(weapon?.templateId)) bonus.ACC += def.effect.amount;
  }
  return bonus;
}
