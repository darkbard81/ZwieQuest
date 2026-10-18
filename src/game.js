import { randomInt, randomUUID } from 'node:crypto';
import { findAppearance, defaultAppearance } from '../public/appearances.js';
import { initializeClassProgress, switchClassProgress, equippedClassIds, classProfiles } from './class-progress.js';
import { attack, stats, statDetails, levelBonus } from './combat.js';
import { MAP_DEFS, createMaps, migrateMaps, refreshMapNames } from './maps.js';
import { availableStarts, navigationPosition, routeTo, visibleTarget } from './navigation.js';
import { rollEncounter } from './encounters.js';
import { EQUIPMENT_CATALOG, DAMAGE_NAMES, generateEquipment, rollWeaponDamage, chance, weaponDefense, migrateArmorDEX, migrateLegacyEquipment } from './equipment.js';
import { availableTactics, validTactic, tacticEffect, validateTactics, COMBAT_RULES_VERSION } from './tactics.js';
export const THEMES = Object.entries(MAP_DEFS).map(([id, def]) => ({ id, name: def.name, subtitle: def.subtitle }));
export class Game {
  constructor(config, state = null, rng = n => randomInt(n)) {
    validateTactics(config); this.config = config; this.state = state; this.rng = n => ((rng(n) % n) + n) % n; this.events = [];
    if (state && !state.maps) { this.installMaps(); this.phase('HOME', config.homeMs); this.log('map', '새 경로 체계로 이동했습니다. 성장과 장비는 유지됩니다.'); }
    if (state) {
      state.progressId ||= randomUUID();
      if (migrateMaps(state)) this.log('map', '경로 지도를 합류 없는 트리로 정리했습니다. 현재 위치와 진행 중인 모험은 유지됩니다.');
      for (const map of Object.values(state.maps)) refreshMapNames(map);
      this.rememberExploration();
      if (!availableStarts(state).includes(state.departureMapId)) state.departureMapId = 'village';
      state.autoRoute ??= null;
      // Keep geometry and in-flight encounters; only remove obsolete fixed assignments.
      for (const map of Object.values(state.maps)) for (const node of Object.values(map.nodes)) delete node.event;
      initializeClassProgress(state);
      // Old saves keep their existing class and acquire its default appearance.
      if (!findAppearance(state.appearanceId) || findAppearance(state.appearanceId).classId !== state.classId) state.appearanceId = defaultAppearance(state.classId).id;
      const replaced = migrateLegacyEquipment(state, this.rng);
      migrateArmorDEX(state.inventory);
      if (replaced) state.hp = Math.min(state.hp, stats(state, config).maxHp);
      if (!validTactic(state.tactic, state.classId, config)) state.tactic = 'normal';
      if (state.battle && state.battle.rulesVersion !== COMBAT_RULES_VERSION) {
        // Finish the already-started round with its saved actor/AP. Never replay or reserve AP on load.
        Object.assign(state.battle, { rulesVersion: COMBAT_RULES_VERSION, roundTactic: 'normal', roundEffects: {}, heroReservedAP: 0, tacticUsed: false });
      }
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
    return this.state.inventory.filter(item => item.gradeId === 'normal' && !equippedClassIds(this.state, item.id).length);
  }
  item(kind, tier) {
    return generateEquipment({ slot: kind, rng: this.rng, gradeId: tier == null ? undefined : EQUIPMENT_CATALOG.grades[tier]?.id });
  }
  starter(kind) {
    const wizard = this.state.classId === 'wizard';
    return generateEquipment({ slot: kind, classId: this.state.classId, rng: this.rng, gradeId: 'normal', specials: false, templateId: kind === 'weapon' ? (wizard ? 'fire-staff' : 'longsword') : (wizard ? 'robe' : 'leather') });
  }
  create(classId) {
    if (!this.config.classes[classId]) throw Error('알 수 없는 클래스입니다.');
    if (this.state) throw Error('이미 모험가가 있습니다. HOME에서 직업을 변경하세요.');
    this.state = { classId, progressId: randomUUID(), level: 1, xp: 0, gold: 0, hp: 1, inventory: [], equipment: {}, run: 0, step: 0, eventSeq: 0, version: 0, completed: 0, victories: 0, chests: 0, theme: 'village', direction: 'right', tactic: 'normal', combatRulesVersion: COMBAT_RULES_VERSION, path: [], lastSummary: null };
    this.installMaps();
    initializeClassProgress(this.state);
    this.state.appearanceId = defaultAppearance(classId).id;
    for (const kind of ['weapon', 'armor']) { const i = this.starter(kind); this.state.inventory.push(i); this.state.equipment[kind] = i.id; }
    this.state.hp = stats(this.state, this.config).maxHp;
    this.phase('HOME', this.config.homeMs); this.log('home', '새로운 모험가가 여관에 도착했습니다. 곧 자동으로 출발합니다.');
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
    const xp = (boss ? tune.bossXP : treasure ? tune.treasureXP : tune.battleXP) + s.risk * tune.riskXP, gold = (boss ? tune.bossGold : treasure ? tune.treasureGold : tune.battleGold) + s.risk * tune.riskGold;
    s.xp += xp; s.gold += gold;
    if (treasure) s.chests++; else s.victories++;
    // One shared 25% roll, then equal weapon / armor / accessory odds.
    const slot = !treasure && chance(this.rng, EQUIPMENT_CATALOG.dropPercent)
      ? ['weapon', 'armor', 'charm'][this.rng(3)] : null;
    const item = slot ? this.item(slot) : null;
    if (item) s.inventory.push(item);
    s.lastReward = { kind, itemId: item?.id || null, itemName: item?.name || null, xp, gold };
    this.log(kind, `${boss ? '보스 격파' : treasure ? '보물 발견' : '전투 승리'} · 경험치 +${xp}, 금화 +${gold}${item ? `, ${item.rarity} ${item.name}` : ' · 장비 없음'}`, { xp, gold, itemId: item?.id || null });
    while (s.xp >= s.level * this.config.xpPerLevel) {
      s.xp -= s.level * this.config.xpPerLevel; const oldMax = stats(s, this.config).maxHp; s.level++;
      s.hp += stats(s, this.config).maxHp - oldMax;
      this.log('level', `레벨 ${s.level}! 최대 HP 증가${levelBonus(s.level) !== levelBonus(s.level - 1) ? ' · 전투 숙련 +1' : ''}`);
    }
    s.hp = Math.min(stats(s, this.config).maxHp, s.hp + (treasure ? tune.treasureHeal : tune.battleHeal));
    s.enemy = null; s.battle = null; this.phase('TREASURE', this.config.treasureMs);
  }
  beginBattle(boss = false) {
    const s = this.state, lb = levelBonus(s.level), names = { village: '이끼 슬라임', volcano: '잿불 정령', beach: '파도 정령', desert: '모래 정령', snow: '서리 정령' };
    const tune = this.config.balance;
    const maxHp = Math.floor((tune.enemyHP + s.step * tune.enemyHPPerStep + s.level * tune.enemyHPPerLevel + s.risk * tune.enemyRiskHP) * (boss ? tune.bossHPMultiplier : 1));
    s.enemy = { boss, name: boss ? MAP_DEFS[s.mapId].boss : names[s.theme], hp: maxHp, maxHp, damageTypes: ['blunt'], typeModifiers: {}, STR: 1, ACC: 3 + lb, DEF: 3 + lb, REF: 4 + lb, WIL: 2 + lb, FOR: 4 + lb, AR: 2 + s.risk, PEN: 2, DEX: this.config.initiative.enemyDEX + (boss ? 1 : 0), base: Math.floor((tune.enemyDamage + s.risk * tune.enemyRiskDamage) * (boss ? tune.bossDamageMultiplier : 1)) };
    const heroDEX = stats(s, this.config).DEX;
    const first = heroDEX > s.enemy.DEX ? 'hero' : heroDEX < s.enemy.DEX ? 'enemy' : this.config.initiative.tieWinner;
    s.battle = { turn: 1, actor: first, firstActor: first, ap: 3, attacks: 0, lastHit: null, rulesVersion: COMBAT_RULES_VERSION };
    this.phase('BATTLE', this.config.battleActionMs); this.log('battle', `${s.enemy.name} 등장! ${first === 'hero' ? '모험가' : '몬스터'} 선공 (DEX ${heroDEX}:${s.enemy.DEX})으로 시작합니다.`);
    this.startRound();
  }
  startRound() {
    const s = this.state, b = s.battle;
    b.roundTactic = s.tactic; b.roundEffects = {}; b.heroReservedAP = 0; b.tacticUsed = false;
    b.actor = b.firstActor; b.ap = 3; b.attacks = 0;
    if (b.roundTactic === 'defend') {
      b.roundEffects = tacticEffect('defend', stats(s, this.config).INT, this.config);
      b.heroReservedAP = this.config.tactics.defend.cost; b.tacticUsed = true;
      if (b.actor === 'hero') b.ap -= b.heroReservedAP;
      this.log('tactic', `라운드 ${b.turn} · 방어태세: ${b.heroReservedAP} AP 예약, AR +${b.roundEffects.AR} (이번 라운드)`, { tacticId: 'defend', round: b.turn, cost: b.heroReservedAP, reserved: true, effects: { ...b.roundEffects } });
    }
  }
  endAction() {
    const b = this.state.battle;
    if (b.ap === 0) {
      const next = b.actor === 'hero' ? 'enemy' : 'hero';
      if (next === b.firstActor) { b.turn++; this.startRound(); }
      else { b.actor = next; b.ap = next === 'hero' ? 3 - b.heroReservedAP : 3; b.attacks = 0; }
    }
    this.phase('BATTLE', this.config.battleActionMs);
  }
  battleAction() {
    const s = this.state, b = s.battle, hero = stats(s, this.config), enemy = s.enemy, tune = this.config.balance;
    const isHero = b.actor === 'hero', attacker = isHero ? hero : enemy, defender = isHero ? enemy : hero;
    if (isHero && b.roundTactic !== 'normal' && !b.tacticUsed) {
      const id = b.roundTactic, tactic = this.config.tactics[id], effect = tacticEffect(id, hero.INT, this.config);
      if (b.ap < tactic.cost) throw Error('전술에 필요한 AP가 부족합니다.');
      b.ap -= tactic.cost; b.tacticUsed = true;
      let description;
      if (id === 'heal') {
        const healed = Math.min(effect.heal, Math.max(0, hero.maxHp - s.hp)); s.hp += healed;
        description = `HP +${healed} (최대 ${effect.heal})`;
        this.log('tactic', `라운드 ${b.turn} · 회복: ${description}, ${tactic.cost} AP`, { tacticId: id, round: b.turn, cost: tactic.cost, healed });
      } else {
        Object.assign(b.roundEffects, effect);
        description = id === 'assault' ? `ACC +${effect.ACC}` : `다음 1회 피해 +${Math.round(effect.damageRate * 100)}% (빗나가도 소모)`;
        this.log('tactic', `라운드 ${b.turn} · ${tactic.name}: ${description}, ${tactic.cost} AP`, { tacticId: id, round: b.turn, cost: tactic.cost, effects: { ...effect } });
      }
      this.endAction(); return;
    }
    const weapon = isHero ? s.inventory.find(i => i.id === s.equipment.weapon) : null;
    const modern = weapon && Array.isArray(weapon.damageTypes), raw = modern && weapon.damageTypes.includes('raw');
    const target = isHero ? weaponDefense(weapon) : (enemy.hitDefense || 'DEF');
    // Old weapons retain their saved damage/power. Their weapon family, never the current class, chooses the legacy base.
    const legacyMagic = weapon?.icon === 'staff';
    const base = modern ? (raw ? weapon.fixedDamage : rollWeaponDamage(weapon, this.rng))
      : isHero ? (weapon ? (legacyMagic ? tune.wizardBasic : tune.warriorBasic) + hero.power : 1) : enemy.base;
    const damageTypes = modern ? weapon.damageTypes : isHero ? [!weapon ? 'blunt' : legacyMagic ? 'fire' : 'slash'] : (enemy.damageTypes || ['blunt']);
    const tacticDamageRate = isHero ? b.roundEffects.damageRate || 0 : 0;
    const result = attack({ roll: this.rng(20) + 1, acc: attacker.ACC - Math.min(10, b.attacks * 5) + (isHero ? b.roundEffects.ACC || 0 : 0), defense: defender[target], str: attacker.STR, base,
      pen: attacker.PEN, ar: defender.AR + (isHero ? 0 : b.roundEffects.AR || 0), damageTypes, typeModifiers: defender.typeModifiers,
      damageRate: modern ? weapon.damageRate || 0 : 0, tacticDamageRate, fixedDamage: raw ? weapon.fixedDamage : undefined });
    if (isHero) delete b.roundEffects.damageRate; // The attempt consumes burst even on a miss or Raw attack.
    const ability = isHero ? '일반 공격' : '몸통 박치기';
    if (isHero) enemy.hp = Math.max(0, enemy.hp - result.damage); else s.hp = Math.max(0, s.hp - result.damage);
    b.ap--; b.attacks++;
    b.lastHit = { ...result, actor: b.actor, ability, target, attackerName: isHero ? '모험가' : enemy.name, defenderName: isHero ? enemy.name : '모험가', at: Date.now(), cost: 1, ap: b.ap, round: b.turn, tacticId: b.roundTactic };
    this.log('hit', `${b.lastHit.attackerName} → ${b.lastHit.defenderName} · ${result.label}! ${DAMAGE_NAMES[result.damageType]} 피해 ${result.damage}`, { hit: b.lastHit });
    if (enemy.hp <= 0) { this.reward(enemy.boss ? 'boss' : 'victory'); return; }
    if (s.hp <= 0) { b.roundEffects = {}; this.phase('DOWNED', this.config.downedMs); this.log('downed', '잠시 쓰러졌습니다. 장비와 금화는 안전합니다. 여관으로 귀환합니다.'); return; }
    this.endAction();
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
      case 'BATTLE': this.battleAction(); break;
      case 'TREASURE': if (s.pendingBossReturn) { s.pendingBossReturn = false; this.finish(false, 'boss'); } else this.nextChoice(); break;
      case 'DOWNED': this.finish(true); break;
      case 'RETURN_HOME':
        s.hp = stats(s, this.config).maxHp; s.mapId = 'village'; s.theme = 'village'; s.currentNodeId = s.maps.village.rootId; s.step = 0;
        this.phase('HOME', this.config.homeMs); this.log('home', '집(HOME)에서 체력을 회복했습니다. 다음 여행을 준비합니다.'); break;
    }
  }
  tick(elapsed, rate) {
    if (!this.state) return false;
    // One actual scheduled event per tick. No replay of stopped-server time.
    this.state.remaining -= elapsed * (this.state.phase === 'CHOICE_WAIT' ? 1 : rate);
    if (this.state.remaining <= 0) { this.advance(); return true; } return false;
  }
  command(cmd) {
    if (cmd.type === 'CREATE') { this.create(cmd.classId); return; }
    const s = this.state; if (!s) throw Error('먼저 클래스를 선택하세요.');
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
    else if (['EQUIP', 'UNEQUIP', 'SELL'].includes(cmd.type)) {
      const item = s.inventory.find(i => i.id === cmd.itemId); if (!item) throw Error('이미 판매했거나 없는 아이템입니다.');
      if (cmd.type === 'EQUIP') { s.equipment[item.slot] = item.id; this.log('equip', `${item.name} 장착 · 다음 공격부터 적용됩니다.`); }
      else if (cmd.type === 'UNEQUIP') { if (s.equipment[item.slot] !== item.id) throw Error('장착 중인 아이템이 아닙니다.'); delete s.equipment[item.slot]; this.log('equip', `${item.name} 장착 해제`); }
      else {
        const owners = equippedClassIds(s, item.id);
        if (owners.length) throw Error(`${owners.map(id => this.config.classes[id]?.name || id).join('·')} 직업에서 장착 해제 후 판매할 수 있습니다.`);
        s.inventory = s.inventory.filter(i => i.id !== item.id); s.gold += item.value; this.log('sell', `${item.name} 판매 · 금화 +${item.value}`);
      }
      s.hp = Math.min(s.hp, stats(s, this.config).maxHp);
    } else if (cmd.type === 'TACTIC') { if (!validTactic(cmd.tactic, s.classId, this.config)) throw Error('잘못된 전술입니다.'); s.tactic = cmd.tactic; this.log('tactic', `${this.config.tactics[cmd.tactic].name} 선택 · ${s.phase === 'BATTLE' ? '다음 라운드부터' : '다음 전투부터'} 적용됩니다.`); }
    else if (cmd.type === 'CLASS' || cmd.type === 'APPEARANCE') {
      if (s.phase !== 'HOME') throw Error('직업 변경은 여관에서 가능합니다.');
      if (s.remaining <= 0) throw Error('선택 시간이 지났습니다.');
      if (cmd.type === 'CLASS' && !Object.hasOwn(this.config.classes, cmd.classId)) throw Error('잘못된 클래스입니다.');
      const appearance = cmd.type === 'APPEARANCE' ? findAppearance(cmd.appearanceId) : defaultAppearance(cmd.classId);
      if (!appearance || !this.config.classes[appearance.classId]) throw Error('잘못된 외형입니다.');
      if (s.appearanceId === appearance.id) return;
      const classChanged = switchClassProgress(s, appearance.classId);
      s.appearanceId = appearance.id;
      if (!validTactic(s.tactic, s.classId, this.config)) s.tactic = 'normal';
      if (classChanged) s.hp = stats(s, this.config).maxHp;
      this.log('class', `${appearance.name} 외형 선택 · ${this.config.classes[s.classId].name} Lv.${s.level}. 직업별 성장·장비·전술을 불러왔습니다. 인벤토리와 금화는 공용입니다.`);
    } else throw Error('지원하지 않는 명령입니다.');
  }
  snapshot() {
    if (!this.state) return null;
    const { maps, ...state } = this.state;
    const { values: hero, defenses: defenseBreakdown } = statDetails(this.state, this.config);
    const roundEffects = state.phase === 'BATTLE' ? { ...state.battle.roundEffects } : {};
    const weapon = state.inventory.find(i => i.id === state.equipment.weapon);
    return { ...structuredClone(state),
      normalSale: this.normalSaleItems().reduce((total, item) => ({ count: total.count + 1, gold: total.gold + item.value }), { count: 0, gold: 0 }),
      classProfiles: classProfiles(state, this.config),
      equipmentUsers: Object.fromEntries(state.inventory.map(i => [i.id, equippedClassIds(state, i.id)])),
      inventory: structuredClone(state.inventory).map(i => i.slot === 'weapon' ? { ...i, hitDefense: weaponDefense(i) } : i),
      availableStarts: availableStarts(this.state).map(id => ({ id, name: maps[id].name })),
      mapGraph: structuredClone(maps[navigationPosition(this.state).mapId]), currentNode: structuredClone(maps[state.mapId].nodes[state.currentNodeId]),
      stats: hero, defenseBreakdown, combatStats: { ...hero, AR: hero.AR + (roundEffects.AR || 0), ACC: hero.ACC + (roundEffects.ACC || 0) },
      hitDefense: weaponDefense(weapon), availableTactics: availableTactics(state.classId, this.config).map(t => ({ ...t, effect: tacticEffect(t.id, hero.INT, this.config) })),
      xpNext: state.level * this.config.xpPerLevel };
  }
}
