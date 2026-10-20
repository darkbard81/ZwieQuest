import { randomInt, randomUUID } from 'node:crypto';
import { CHARACTER_VERSION, MAX_CHARACTERS, activeCharacter, newCharacter, migrateCharacters, equipmentUsers, remainingPoints, allocatePoint } from './characters.js';
import { attack, stats, statDetails } from './combat.js';
import { MAP_DEFS, createMaps, migrateMaps, refreshMapNames } from './maps.js';
import { availableStarts, navigationPosition, routeTo, visibleTarget } from './navigation.js';
import { rollEncounter } from './encounters.js';
import { generateMonster, generateBoss, monsterRewards, recordMonsterEncounter } from './monsters.js';
import { EQUIPMENT_CATALOG, DAMAGE_NAMES, generateEquipment, rollWeaponDamage, chance, weaponDefense, migrateArmorSpeed, migrateLegacyEquipment } from './equipment.js';
import { initializeSkills, initializeBattleSkills, skillItemView, equipSkill, useSkill, toggleSkill, maintainedSkillBonuses } from './skills.js';
import { COMBAT_RULES_VERSION, DEFAULT_SPEED, actionSpeed, newCombatants, migrateBattle, nextAction, advanceReadiness } from './action-speed.js';
export const THEMES = Object.entries(MAP_DEFS).map(([id, def]) => ({ id, name: def.name, subtitle: def.subtitle }));
export class Game {
  constructor(config, state = null, rng = n => randomInt(n)) {
    this.config = config; this.state = state; this.rng = n => ((rng(n) % n) + n) % n; this.events = [];
    if (!state) { this.createAccount(); return; }
    if (state && !state.maps) { this.installMaps(); this.phase('HOME', config.homeMs); this.log('map', '새 경로 체계로 이동했습니다. 성장과 장비는 유지됩니다.'); }
    if (state) {
      state.progressId ||= randomUUID();
      state.bestiary ||= {};
      if (state.enemy?.generationVersion === 1 && !state.bestiary[state.enemy.variationId]) recordMonsterEncounter(state, state.enemy);
      if (migrateMaps(state)) this.log('map', '경로 지도를 합류 없는 트리로 정리했습니다. 현재 위치와 진행 중인 모험은 유지됩니다.');
      for (const map of Object.values(state.maps)) refreshMapNames(map);
      this.rememberExploration();
      if (!availableStarts(state).includes(state.departureMapId)) state.departureMapId = 'village';
      state.autoRoute ??= null;
      // Keep geometry and in-flight encounters; only remove obsolete fixed assignments.
      for (const map of Object.values(state.maps)) for (const node of Object.values(map.nodes)) delete node.event;
      // Convert retired gear using the legacy appearance hint before removing class fields.
      migrateLegacyEquipment(state, this.rng);
      migrateArmorSpeed(state.inventory);
      const migrated = migrateCharacters(state);
      if (state.characters.length > MAX_CHARACTERS || (state.characters.length && !activeCharacter(state))) throw Error('잘못된 캐릭터 저장 상태입니다.');
      for (const character of state.characters) {
        initializeSkills({ characters: [character], activeCharacterId: character.id });
        const maxHp = statDetails(state, config, character).values.maxHp;
        character.hp = character.hp == null ? maxHp : Math.min(character.hp, maxHp);
      }
      if (!state.characters.length) { state.activeCharacterId = null; state.homePaused = true; if (state.phase !== 'HOME') this.phase('HOME', config.homeMs); }
      if (migrated) this.log('character', '캐릭터별 성장으로 이전했습니다. 기존 성장과 소지품은 보존하고 능력치 포인트를 지급했습니다.');
      initializeBattleSkills(state.battle);
      if (state.battle) {
        state.battle.id ||= randomUUID();
        migrateBattle(state, this.character?.hp > 0);
      }
      if (state.enemy) Object.assign(state.enemy, actionSpeed(state.enemy.DEX || 0, state.enemy.armor?.actionSpeedPenaltyRate ?? state.enemy.actionSpeedPenaltyRate ?? 0, config));
      delete state.tactic;
      state.combatRulesVersion = COMBAT_RULES_VERSION;
      // Older saves paused at regional entrances as HOME. Resume the same journey.
      if (state.phase === 'HOME' && state.mapId !== 'village') this.nextChoice();
    }
  }
  installMaps() { const s = this.state; s.maps = createMaps(this.rng); s.mapId = 'village'; s.departureMapId = 'village'; s.autoRoute = null; s.checkpointHistory = []; s.currentNodeId = s.maps.village.rootId; s.theme = 'village'; s.step = 0; s.path = []; s.exploredNodes = {}; this.rememberExploration(); s.bossDefeats = s.bossDefeats || 0; s.enemy = null; s.battle = null; }
  rememberExploration() {
    const s = this.state;
    s.exploredNodes ||= {};
    // Old saves can recover only their retained route, location and checkpoints.
    const known = [s.currentNodeId, ...(s.path || []).flatMap(p => [p.from, p.to]), ...(s.checkpointHistory || []).map(c => c.nodeId)];
    for (const [id, map] of Object.entries(s.maps)) {
      s.exploredNodes[id] = [...new Set([...(s.exploredNodes[id] || []), ...known].filter(nodeId => map.nodes[nodeId]))];
    }
  }
  log(type, text, detail = {}) { const e = { seq: ++this.state.eventSeq, at: Date.now(), type, text, ...detail }; this.events.push(e); this.state.lastEvent = e; }
  phase(phase, ms) { Object.assign(this.state, { phase, remaining: ms, duration: ms, phaseStartedAt: Date.now() }); }
  normalSaleItems() {
    return this.state.inventory.filter(item => item.slot !== 'skill' && item.gradeId === 'normal' && !equipmentUsers(this.state, item.id).length);
  }
  item(kind, tier) {
    return generateEquipment({ slot: kind, rng: this.rng, gradeId: tier == null ? undefined : EQUIPMENT_CATALOG.grades[tier]?.id });
  }
  get character() { return activeCharacter(this.state); }
  createAccount() {
    this.state = { characterVersion: CHARACTER_VERSION, characters: [], activeCharacterId: null, homePaused: true,
      progressId: randomUUID(), bestiary: {}, gold: 0, inventory: [], run: 0, step: 0, eventSeq: 0, version: 0,
      completed: 0, victories: 0, chests: 0, theme: 'village', direction: 'right', combatRulesVersion: COMBAT_RULES_VERSION, path: [], lastSummary: null };
    this.installMaps(); this.phase('HOME', this.config.homeMs);
  }
  requireHome() { if (this.state.phase !== 'HOME') throw Error('캐릭터 관리는 여관에서 가능합니다.'); }
  requireCharacter(id) {
    const c = this.state.characters.find(c => c.id === id);
    if (!c) throw Error('이 계정의 캐릭터가 아닙니다.');
    return c;
  }
  create({ name, appearanceId }) {
    this.requireHome();
    const s = this.state;
    if (s.characters.length >= MAX_CHARACTERS) throw Error('캐릭터는 최대 3명까지 보유할 수 있습니다.');
    const character = newCharacter(name, appearanceId);
    for (const [slot, templateId] of [['weapon', 'dagger'], ['armor', 'robe']]) {
      const item = generateEquipment({ slot, templateId, gradeId: 'normal', specials: false, rng: this.rng });
      s.inventory.push(item); character.equipment[slot] = item.id;
    }
    initializeSkills({ characters: [character], activeCharacterId: character.id });
    s.characters.push(character);
    character.hp = statDetails(s, this.config, character).values.maxHp;
    s.activeCharacterId ||= character.id; s.homePaused = true;
    this.log('character', `${character.name}이 여관에 도착했습니다. 능력치 포인트 10점을 자유롭게 배분하세요.`, { characterId: character.id });
    return character;
  }
  selectCharacter(id) {
    this.requireHome(); const c = this.requireCharacter(id);
    this.state.activeCharacterId = c.id;
    this.phase('HOME', this.config.homeMs);
    this.log('character', `${c.name}을 다음 모험의 출전 캐릭터로 선택했습니다.`, { characterId: c.id });
  }
  retireCharacter(id, confirmName) {
    this.requireHome(); const s = this.state, c = this.requireCharacter(id);
    if (confirmName !== c.name) throw Error('은퇴할 캐릭터의 이름을 확인하세요.');
    s.characters = s.characters.filter(c => c.id !== id);
    if (s.activeCharacterId === id) s.activeCharacterId = s.characters[0]?.id || null;
    s.homePaused = true;
    this.log('character', `${c.name}이 은퇴했습니다. 공용 장비·금화·지도는 보존됩니다.`, { characterId: id });
  }
  choose(direction, automatic = false) {
    const s = this.state, map = s.maps[s.mapId], node = map.nodes[s.currentNodeId];
    if (s.phase !== 'CHOICE_WAIT' || !['left', 'right'].includes(direction) || !node.edges?.[direction]) throw Error('이 갈림길은 이미 지나갔습니다.');
    const target = map.nodes[node.edges[direction]];
    if (target.depth !== node.depth + 1) throw Error('앞으로 가는 경로만 선택할 수 있습니다.');
    if (!automatic) s.autoRoute = null;
    s.direction = direction; s.risk = direction === 'left' ? 0 : 1;
    s.path.push({ from: node.id, to: target.id, direction }); s.currentNodeId = target.id; s.step = target.depth; s.choiceId = null;
    this.rememberExploration();
    this.phase('TRAVEL', this.config.travelMs);
    this.log('travel', `${automatic ? '자동 선택' : '길 선택'} · ${direction === 'left' ? '왼쪽' : '오른쪽'}으로 전진합니다. (${s.step}/10)`);
  }
  nextChoice() {
    const s = this.state, node = s.maps[s.mapId].nodes[s.currentNodeId];
    if (!node.edges) throw Error('종착점에는 다음 분기가 없습니다.');
    s.choiceId = randomUUID(); this.phase('CHOICE_WAIT', this.config.choiceMs);
    this.log('choice', '두 갈래 길을 만났습니다. 선택하지 않아도 모험은 계속됩니다.');
    this.followAutoRoute();
  }
  followAutoRoute() {
    const s = this.state, target = s.autoRoute;
    if (!target) return false;
    const path = target.mapId === s.mapId ? routeTo(s.maps[s.mapId], s.currentNodeId, target.nodeId) : null;
    if (!path?.length) { s.autoRoute = null; return false; }
    this.choose(path[0].direction, true);
    return true;
  }
  enterRegion(region) {
    const s = this.state; s.completed++; s.mapId = region; s.theme = region;
    s.currentNodeId = s.maps[region].rootId;
    if (!s.checkpointHistory.some(c => c.mapId === region && c.nodeId === s.currentNodeId)) s.checkpointHistory.push({ mapId: region, nodeId: s.currentNodeId, firstPassedAt: Date.now() });
    s.step = 0; s.path = []; s.enemy = null; s.battle = null;
    this.rememberExploration();
    this.log('checkpoint', `${MAP_DEFS[region].name}에 도착했습니다. 다음 여관 출발 지역으로 선택할 수 있습니다.`);
    this.nextChoice();
  }
  reward(kind) {
    const s = this.state, treasure = kind === 'treasure', boss = kind === 'boss', tune = this.config.balance;
    const bossRewardId = `${s.run}:${s.mapId}:${s.currentNodeId}`;
    if (boss && s.lastBossRewardId === bossRewardId) return;
    if (boss) { s.lastBossRewardId = bossRewardId; s.bossDefeats++; s.pendingBossReturn = true; }
    if (!this.character) throw Error('출전 캐릭터가 없습니다.');
    const generated = !boss && !treasure && s.enemy?.generationVersion === 1;
    const rewards = generated ? monsterRewards(s.enemy, this.character.level, this.config.xpPerLevel) : {
      xp: treasure ? 0 : (boss ? tune.bossXP : tune.battleXP) + s.risk * tune.riskXP,
      gold: (boss ? tune.bossGold : treasure ? tune.treasureGold : tune.battleGold) + s.risk * tune.riskGold, canDrop: true };
    const { xp, gold } = rewards;
    if (!treasure && s.enemy?.generationVersion === 1 && s.bestiary[s.enemy.variationId]) s.bestiary[s.enemy.variationId].defeats++;
    this.character.xp += xp; s.gold += gold;
    if (treasure) s.chests++; else s.victories++;
    // One shared 25% roll, then equal weapon / armor / accessory odds.
    const slot = !treasure && rewards.canDrop && chance(this.rng, EQUIPMENT_CATALOG.dropPercent)
      ? ['weapon', 'armor', 'charm'][this.rng(3)] : null;
    const item = slot ? this.item(slot) : null;
    if (item) s.inventory.push(item);
    s.lastReward = { kind, goldOnly: treasure || (generated && !rewards.canDrop), itemId: item?.id || null, itemName: item?.name || null, xp, gold };
    this.log(kind, treasure ? `보물 발견 · 금화 +${gold}` : `${boss ? '보스 격파' : '전투 승리'} · 경험치 +${xp}, 금화 +${gold}${item ? `, ${item.rarity} ${item.name}` : generated && !rewards.canDrop ? ' · 하위 레벨 몬스터: 골드만 획득' : ' · 장비 없음'}`, { battleId: s.battle?.id ?? null, xp, gold, itemId: item?.id || null, characterId: this.character.id });
    while (this.character.xp >= this.character.level * this.config.xpPerLevel) {
      this.character.xp -= this.character.level * this.config.xpPerLevel; this.character.level++;
      this.log('level', `레벨 ${this.character.level}! 최대 HP 증가`);
    }
    s.lastBattleId = s.battle?.id ?? null;
    s.enemy = null; s.battle = null; this.phase('TREASURE', this.config.treasureMs);
  }
  beginBattle(boss = false) {
    if (!this.character) throw Error('출전 캐릭터가 없습니다.');
    const s = this.state;
    s.enemy = boss ? generateBoss(s.mapId, this.character.level, this.rng, undefined, undefined, this.config)
      : generateMonster(s.mapId, this.rng, undefined, undefined, this.config);
    recordMonsterEncounter(s, s.enemy);
    Object.assign(s.enemy, actionSpeed(s.enemy.DEX || 0, s.enemy.armor?.actionSpeedPenaltyRate || 0, this.config));
    s.battle = { id: randomUUID(), skillUsed: false, skillUseCounts: {}, skillToggles: {}, combatants: newCombatants(), actionSeq: 0, elapsedMs: 0, lastHit: null, rulesVersion: COMBAT_RULES_VERSION };
    this.phase('BATTLE', 0); this.refreshBattleTiming();
    this.log('battle', `${s.enemy.name}${s.enemy.level ? ` Lv.${s.enemy.level}` : ''} 등장! 각자의 행동속도로 전투를 시작합니다.`);
  }
  battleIntervals() {
    const s = this.state;
    return { hero: stats(s, this.config).actionIntervalMs, enemy: actionSpeed(s.enemy.DEX || 0, s.enemy.actionSpeedPenaltyRate || 0, this.config).actionIntervalMs };
  }
  refreshBattleTiming() {
    const s = this.state, b = s.battle;
    if (s.phase !== 'BATTLE' || !b) return;
    if (b.transition) { s.remaining = b.transition.remainingMs; s.duration = b.transition.durationMs; return; }
    const intervals = this.battleIntervals(), next = nextAction(b, intervals, this.config.initiative.tieWinner);
    s.remaining = next.wait; s.duration = intervals[next.actor];
  }
  battleAction(actor) {
    if (this.state.phase !== 'BATTLE' || !['hero','enemy'].includes(actor) || this.character.hp <= 0 || this.state.enemy?.hp <= 0) return;
    const s = this.state, b = s.battle, hero = stats(s, this.config), enemy = s.enemy, tune = this.config.balance;
    const isHero = actor === 'hero', attacker = isHero ? hero : enemy, defender = isHero ? enemy : hero;
    const weapon = isHero ? s.inventory.find(i => i.id === this.character.equipment.weapon) : enemy.weapon;
    const modern = weapon && Array.isArray(weapon.damageTypes), raw = modern && weapon.damageTypes.includes('raw');
    const target = isHero ? weaponDefense(weapon) : (enemy.hitDefense || 'DEF');
    // Old weapons retain their saved damage/power. Their weapon family, never the current class, chooses the legacy base.
    const legacyMagic = weapon?.icon === 'staff';
    const base = modern ? (raw ? weapon.fixedDamage : rollWeaponDamage(weapon, this.rng))
      : isHero ? (weapon ? (legacyMagic ? tune.legacyStaffBasic : tune.legacySwordBasic) + hero.power : 1) : enemy.base;
    const damageTypes = modern ? weapon.damageTypes : isHero ? [!weapon ? 'blunt' : legacyMagic ? 'fire' : 'slash'] : (enemy.damageTypes || ['blunt']);
    const result = attack({ roll: this.rng(20) + 1, acc: attacker.ACC + (isHero ? maintainedSkillBonuses(s).ACC : 0), defense: defender[target], str: attacker.STR, base,
      pen: attacker.PEN, ar: defender.AR, damageTypes, typeModifiers: defender.typeModifiers,
      damageRate: modern ? weapon.damageRate || 0 : 0, fixedDamage: raw ? weapon.fixedDamage : undefined });
    const ability = isHero ? '일반 공격' : (enemy.attackName || '몸통 박치기');
    if (isHero) enemy.hp = Math.max(0, enemy.hp - result.damage); else this.character.hp = Math.max(0, this.character.hp - result.damage);
    b.actionSeq++; b.combatants[actor].actionSeq++;
    if (isHero) b.skillUsed = false;
    b.lastHit = { ...result, actor, ability, target, attackerName: isHero ? this.character.name : enemy.name, defenderName: isHero ? enemy.name : this.character.name, at: Date.now(), battleId: b.id, actionSeq: b.actionSeq, actorActionSeq: b.combatants[actor].actionSeq, combatTimeMs: b.elapsedMs };
    this.log('hit', `${b.lastHit.attackerName} → ${b.lastHit.defenderName} · ${result.label}! ${DAMAGE_NAMES[result.damageType]} 피해 ${result.damage}`, { hit: b.lastHit });
    if (enemy.hp <= 0) { this.reward(enemy.boss ? 'boss' : 'victory'); return; }
    if (this.character.hp <= 0) { this.phase('DOWNED', this.config.downedMs); this.log('downed', '잠시 쓰러졌습니다. 장비와 금화는 안전합니다. 여관으로 귀환합니다.'); return; }
    this.refreshBattleTiming();
  }
  finish(downed, reason = 'deadend') {
    const s = this.state; s.completed++; s.autoRoute = null;
    s.lastSummary = { run: s.run, theme: s.theme, gold: s.gold - s.runGold, xp: s.eventSeq, steps: s.step, downed, reason, at: Date.now() };
    this.phase('RETURN_HOME', this.config.returnMs);
    this.log('return', `${downed ? '안전 귀환' : reason === 'boss' ? '보스 탐험 완료' : '막다른 길 도착'} · ${s.run}번째 여행에서 금화 ${s.lastSummary.gold}개를 모았습니다. 다음 여행이 곧 시작됩니다.`);
    s.enemy = null; s.battle = null;
  }
  advance() {
    const s = this.state;
    switch (s.phase) {
      case 'HOME':
        if (!this.character || s.homePaused) return;
        this.character.hp = stats(s, this.config).maxHp;
        s.mapId = availableStarts(s).includes(s.departureMapId) ? s.departureMapId : 'village';
        s.run++; s.runGold = s.gold; s.step = 0; s.path = []; s.pendingBossReturn = false;
        s.theme = s.mapId; s.currentNodeId = s.maps[s.mapId].rootId;
        this.rememberExploration();
        this.log('depart', `${s.run}번째 여행 · ${MAP_DEFS[s.mapId].name} 출발점에서 모험을 시작합니다.`); this.nextChoice(); break;
      case 'CHOICE_WAIT': if (!this.followAutoRoute()) this.choose(this.rng(2) ? 'right' : 'left', true); break;
      case 'TRAVEL': {
        const node = s.maps[s.mapId].nodes[s.currentNodeId];
        if (s.autoRoute?.mapId === s.mapId && s.autoRoute.nodeId === node.id) s.autoRoute = null;
        if (node.kind === 'deadend') this.finish(false);
        else if (node.kind === 'exit') this.enterRegion(node.region);
        else if (node.kind === 'boss') this.beginBattle(true);
        else {
          const encounter = rollEncounter(this.rng);
          if (encounter === 'battle') this.beginBattle();
          else if (encounter === 'treasure') this.reward('treasure');
          else { this.log('pass', '조용한 길을 지나 다음 갈림길에 도착했습니다.'); this.nextChoice(); }
        }
        break;
      }
      case 'BATTLE': return; // The independent scheduler owns battle time.
      case 'TREASURE': if (s.pendingBossReturn) { s.pendingBossReturn = false; this.finish(false, 'boss'); } else this.nextChoice(); break;
      case 'DOWNED': this.finish(true); break;
      case 'RETURN_HOME':
        s.mapId = 'village'; s.theme = 'village'; s.currentNodeId = s.maps.village.rootId; s.step = 0;
        this.phase('HOME', this.config.homeMs); this.log('home', '여관에 도착했습니다. 다음 여행을 시작할 때 체력을 회복합니다.'); break;
    }
  }
  tick(elapsed, rate = 1) {
    const s = this.state;
    if (!s || !Number.isFinite(elapsed) || elapsed < 0 || !Number.isFinite(rate) || rate < 0) return false;
    let pending = (s.pendingGameMs || 0) + elapsed * rate, changed = false;
    const limit = this.config.actionSpeed?.maxEventsPerTick ?? DEFAULT_SPEED.maxEventsPerTick;
    if (!Number.isSafeInteger(limit) || limit < 1) throw Error('Invalid event budget');
    for (let count = 0; count < limit; count++) {
      if (s.phase === 'HOME' && (!this.character || s.homePaused)) { pending = 0; break; }
      if (s.phase === 'BATTLE') {
        const b = s.battle;
        if (!b || !s.enemy || this.character.hp <= 0 || s.enemy.hp <= 0) { pending = 0; break; }
        const intervals = this.battleIntervals();
        const next = b.transition ? { actor: b.transition.actor, wait: b.transition.remainingMs } : nextAction(b, intervals, this.config.initiative.tieWinner);
        const due = pending + 1e-7 >= next.wait, step = due ? next.wait : pending;
        if (b.transition) { b.elapsedMs += step; b.transition.remainingMs = Math.max(0, b.transition.remainingMs - step); }
        else advanceReadiness(b, intervals, step);
        pending = Math.max(0, pending - step);
        if (!due) { this.refreshBattleTiming(); break; }
        if (b.transition) delete b.transition;
        else b.combatants[next.actor].readiness = Math.max(0, b.combatants[next.actor].readiness - 1);
        this.battleAction(next.actor); changed = true;
      } else {
        const wait = Math.max(0, s.remaining);
        if (pending + 1e-7 < wait) { s.remaining -= pending; pending = 0; break; }
        pending = Math.max(0, pending - wait); s.remaining = 0;
        this.advance(); changed = true;
      }
    }
    s.pendingGameMs = pending;
    this.refreshBattleTiming();
    return changed;
  }
  command(cmd) {
    try { return this.applyCommand(cmd); } finally { this.refreshBattleTiming(); }
  }
  applyCommand(cmd) {
    const s = this.state;
    if (s.pendingGameMs > 1e-7 || (s.phase === 'BATTLE' && s.remaining <= 1e-7)) throw Error('이전 행동을 처리 중입니다. 잠시 후 다시 시도하세요.');
    if (cmd.type === 'CREATE_CHARACTER') { this.create(cmd); return; }
    if (cmd.type === 'SELECT_CHARACTER') { this.selectCharacter(cmd.characterId); return; }
    if (cmd.type === 'RETIRE_CHARACTER') { this.retireCharacter(cmd.characterId, cmd.confirmName); return; }
    if (cmd.type === 'PAUSE_HOME') { this.requireHome(); s.homePaused = true; return; }
    if (cmd.type === 'RESUME_HOME' || cmd.type === 'DEPART') {
      this.requireHome();
      if (!this.character) throw Error('먼저 캐릭터를 생성하고 선택하세요.');
      if (cmd.characterId !== this.character.id) throw Error('출전 캐릭터가 변경되었습니다. 다시 확인하세요.');
      s.homePaused = false; this.phase('HOME', this.config.homeMs);
      if (cmd.type === 'DEPART') this.advance();
      return;
    }
    const personal = ['ALLOCATE_STAT', 'EQUIP', 'UNEQUIP', 'USE_SKILL', 'TOGGLE_SKILL'];
    if (personal.includes(cmd.type) && (!this.character || cmd.characterId !== this.character.id)) throw Error('출전 캐릭터가 변경되었습니다. 현재 캐릭터에서 다시 선택하세요.');
    if (cmd.type === 'ALLOCATE_STAT') {
      allocatePoint(this.character, cmd.stat);
      this.log('character', `${this.character.name} · ${cmd.stat} +1 (남은 포인트 ${remainingPoints(this.character)})`, { characterId: this.character.id });
      return;
    }
    if (cmd.type === 'CHOOSE') { if (cmd.choiceId !== s.choiceId || s.remaining <= 0) throw Error('선택 시간이 지났습니다.'); this.choose(cmd.direction); }
    else if (cmd.type === 'START_MAP') {
      if (!availableStarts(s).includes(cmd.mapId)) throw Error('아직 통과하지 않은 체크포인트입니다.');
      if (s.departureMapId === cmd.mapId) return;
      s.departureMapId = cmd.mapId;
      if (s.phase === 'HOME') s.autoRoute = null;
      this.log('map', `다음 출발 지역 · ${s.maps[cmd.mapId].name}. 여관에서 출발할 때 적용됩니다.`);
    }
    else if (cmd.type === 'AUTO_ROUTE') {
      if (!['HOME', 'CHOICE_WAIT', 'TRAVEL', 'BATTLE', 'TREASURE'].includes(s.phase)) throw Error('여관에 도착한 후 자동 이동을 선택하세요.');
      const position = navigationPosition(s), map = s.maps[position.mapId];
      if (cmd.mapId !== position.mapId || !map.nodes[cmd.nodeId] || !visibleTarget(s, position.mapId, cmd.nodeId)) throw Error('지도에 표시된 노드를 선택하세요.');
      const path = routeTo(map, position.nodeId, cmd.nodeId);
      if (!path?.length) throw Error('현재 위치보다 앞으로 이어지는 노드를 선택하세요.');
      s.autoRoute = { mapId: position.mapId, nodeId: cmd.nodeId };
      this.log('map', '자동 이동 목표를 선택했습니다. 도착할 때까지 갈림길 방향을 자동으로 선택합니다.');
      if (s.phase === 'CHOICE_WAIT') this.followAutoRoute();
    }
    else if (cmd.type === 'CANCEL_ROUTE') { s.autoRoute = null; }
    else if (cmd.type === 'SELL_NORMAL') {
      const items = this.normalSaleItems(), ids = new Set(items.map(item => item.id));
      if (!items.length) return;
      const gold = items.reduce((sum, item) => sum + item.value, 0);
      s.inventory = s.inventory.filter(item => !ids.has(item.id)); s.gold += gold;
      this.log('sell', `일반 아이템 ${items.length}개 일괄 판매 · 금화 +${gold}`, { count: items.length, gold });
    }
    else if (cmd.type === 'USE_SKILL') {
      const result = useSkill(s, this.character.skills.find(i => i.id === cmd.itemId), stats(s, this.config), cmd);
      this.log('skill', `${result.heroActionSeq == null ? '비전투' : `개인 주기 ${result.heroActionSeq}`} · ${result.name}: HP +${result.healed}`, result);
    }
    else if (cmd.type === 'TOGGLE_SKILL') {
      const result = toggleSkill(s, this.character.skills.find(i => i.id === cmd.itemId), stats(s, this.config), cmd);
      if (result) this.log('skill-toggle', `${result.name} · ${result.enabled ? 'ON' : 'OFF'}`, result);
    }
    else if (['EQUIP', 'UNEQUIP', 'SELL'].includes(cmd.type)) {
      const item = [...s.inventory, ...(this.character?.skills || [])].find(i => i.id === cmd.itemId); if (!item) throw Error('이미 판매했거나 없는 아이템입니다.');
      if (item.slot === 'skill') {
        if (cmd.type === 'SELL') throw Error('습득한 스킬은 판매할 수 없습니다.');
        equipSkill(s, item, cmd.type === 'UNEQUIP', cmd.slotIndex);
        this.log('equip', `${item.name} 스킬 ${cmd.type === 'UNEQUIP' ? '장착 해제' : '장착'}`);
        return;
      }
      if (cmd.type === 'EQUIP') {
        const other = equipmentUsers(s, item.id).find(id => id !== this.character.id);
        if (other) throw Error(`${this.requireCharacter(other).name}이 장착 중입니다. 해당 캐릭터에서 먼저 해제하세요.`);
        this.character.equipment[item.slot] = item.id; this.log('equip', `${item.name} 장착 · 다음 공격부터 적용됩니다.`); }
      else if (cmd.type === 'UNEQUIP') { if (this.character.equipment[item.slot] !== item.id) throw Error('장착 중인 아이템이 아닙니다.'); delete this.character.equipment[item.slot]; this.log('equip', `${item.name} 장착 해제`); }
      else {
        const owners = equipmentUsers(s, item.id);
        if (owners.length) throw Error(`${owners.map(id => this.requireCharacter(id).name).join('·')} 캐릭터에서 장착 해제 후 판매할 수 있습니다.`);
        s.inventory = s.inventory.filter(i => i.id !== item.id); s.gold += item.value; this.log('sell', `${item.name} 판매 · 금화 +${item.value}`);
      }
      if (this.character) this.character.hp = Math.min(this.character.hp, stats(s, this.config).maxHp);
    } else throw Error('지원하지 않는 명령입니다.');
  }
  snapshot() {
    if (!this.state) return null;
    const { maps, characters, ...state } = this.state;
    const c = this.character;
    const { values: hero, defenses: defenseBreakdown } = statDetails(this.state, this.config);
    const weapon = state.inventory.find(i => i.id === c?.equipment.weapon);
    const battleTiming = state.phase === 'BATTLE' && state.battle ? Object.fromEntries(['hero','enemy'].map(actor => {
      const values = actor === 'hero' ? hero : actionSpeed(state.enemy.DEX || 0, state.enemy.actionSpeedPenaltyRate || 0, this.config);
      const readiness = state.battle.combatants[actor].readiness;
      return [actor, { actionSpeed: values.actionSpeed, actionSpeedPenaltyRate: values.actionSpeedPenaltyRate, readiness, nextActionMs: state.battle.transition ? state.battle.transition.remainingMs + (state.battle.transition.actor === actor ? 0 : values.actionIntervalMs) : Math.max(0, 1 - readiness) * values.actionIntervalMs }];
    })) : null;
    return { ...structuredClone(state), battleTiming,
      ...(c ? structuredClone(c) : { name: '', appearanceId: null, level: 0, xp: 0, hp: 0, attributes: {}, equipment: {}, skillSlots: Array(6).fill(null), skillCooldowns: {} }),
      attributePoints: remainingPoints(c),
      characters: characters.map(c => ({ ...structuredClone(c), attributePoints: remainingPoints(c), maxHp: statDetails(this.state, this.config, c).values.maxHp })),
      normalSale: this.normalSaleItems().reduce((total, item) => ({ count: total.count + 1, gold: total.gold + item.value }), { count: 0, gold: 0 }),
      equipmentUsers: Object.fromEntries(state.inventory.map(i => [i.id, equipmentUsers(this.state, i.id)])),
      inventory: [...structuredClone(state.inventory).map(i => i.slot === 'weapon' ? { ...i, hitDefense: weaponDefense(i) } : i), ...(c?.skills || []).map(i => skillItemView(i, this.state, hero))],
      availableStarts: availableStarts(this.state).map(id => ({ id, name: maps[id].name })),
      mapGraph: structuredClone(maps[navigationPosition(this.state).mapId]), currentNode: structuredClone(maps[state.mapId].nodes[state.currentNodeId]),
      stats: hero, defenseBreakdown, combatStats: { ...hero, ACC: hero.ACC + maintainedSkillBonuses(this.state).ACC },
      hitDefense: weaponDefense(weapon), xpNext: (c?.level || 1) * this.config.xpPerLevel };
  }
}
