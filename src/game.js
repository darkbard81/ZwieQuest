import { randomInt, randomUUID } from 'node:crypto';
import { attack, stats, levelBonus } from './combat.js';
import { MAP_DEFS, createMaps } from './maps.js';
export const THEMES = Object.entries(MAP_DEFS).map(([id, def]) => ({ id, name: def.name, subtitle: def.subtitle }));
export class Game {
  constructor(config, state = null, rng = n => randomInt(n)) { this.config = config; this.state = state; this.rng = n => ((rng(n) % n) + n) % n; this.events = []; if (state && !state.maps) { this.installMaps(); this.phase('HOME', config.homeMs); this.log('map', '새 경로 체계로 이동했습니다. 성장과 장비는 유지됩니다.'); } }
  installMaps() { const s = this.state; s.maps = createMaps(this.rng); s.mapId = 'village'; s.checkpointHistory = []; s.currentNodeId = s.maps.village.rootId; s.theme = 'village'; s.step = 0; s.path = []; s.bossDefeats = s.bossDefeats || 0; s.enemy = null; s.battle = null; }
  log(type, text, detail = {}) { const e = { seq: ++this.state.eventSeq, at: Date.now(), type, text, ...detail }; this.events.push(e); this.state.lastEvent = e; }
  phase(phase, ms) { Object.assign(this.state, { phase, remaining: ms, duration: ms, phaseStartedAt: Date.now() }); }
  item(kind, tier = 0) {
    const id = randomUUID(), wizard = this.state.classId === 'wizard', gear = this.config.equipment;
    const rarity = tier >= 2 ? '희귀' : tier === 1 ? '고급' : '일반';
    const defs = { weapon: { name: wizard ? '별빛 지팡이' : '여행자의 검', icon: wizard ? 'staff' : 'sword', classId: this.state.classId, stats: { power: tier * gear.powerPerTier, PEN: (wizard ? gear.wizardPEN : gear.warriorPEN) + Math.min(tier, 2) } }, armor: { name: '수호자의 외투', icon: 'armor', stats: { AR: gear.armorAR + Math.min(tier, 3), HP: tier * gear.armorHPPerTier } }, charm: { name: '새벽의 부적', icon: 'charm', stats: { ACC: gear.charmACC + Math.min(tier, 2), WIL: tier } } };
    return { id, slot: kind, tier, rarity, value: gear.basePrice + tier * gear.pricePerTier, ...defs[kind] };
  }
  create(classId) {
    if (!this.config.classes[classId]) throw Error('알 수 없는 클래스입니다.');
    if (this.state) throw Error('이미 모험가가 있습니다. HOME에서 직업을 변경하세요.');
    this.state = { classId, level: 1, xp: 0, gold: 0, hp: 1, inventory: [], equipment: {}, run: 0, step: 0, eventSeq: 0, version: 0, completed: 0, victories: 0, chests: 0, theme: 'village', direction: 'right', tactic: 'balanced', path: [], lastSummary: null };
    this.installMaps();
    for (const kind of ['weapon', 'armor']) { const i = this.item(kind); this.state.inventory.push(i); this.state.equipment[kind] = i.id; }
    this.state.inventory.push(this.item('charm', 1));
    this.state.hp = stats(this.state, this.config).maxHp;
    this.phase('HOME', this.config.homeMs); this.log('home', '새로운 모험가가 여관에 도착했습니다. 곧 자동으로 출발합니다.');
  }
  choose(direction, automatic = false) {
    const s = this.state, map = s.maps[s.mapId], node = map.nodes[s.currentNodeId];
    if (s.phase !== 'CHOICE_WAIT' || !['left', 'right'].includes(direction) || !node.edges?.[direction]) throw Error('이 갈림길은 이미 지나갔습니다.');
    const target = map.nodes[node.edges[direction]];
    if (target.depth !== node.depth + 1) throw Error('앞으로 가는 경로만 선택할 수 있습니다.');
    s.direction = direction; s.risk = direction === 'left' ? 0 : 1;
    s.path.push({ from: node.id, to: target.id, direction }); s.currentNodeId = target.id; s.step = target.depth; s.choiceId = null;
    this.phase('TRAVEL', this.config.travelMs);
    this.log('travel', `${automatic ? '자동 선택' : '길 선택'} · ${direction === 'left' ? '왼쪽' : '오른쪽'}으로 전진합니다. (${s.step}/10)`);
  }
  nextChoice() {
    const s = this.state, node = s.maps[s.mapId].nodes[s.currentNodeId];
    if (!node.edges) throw Error('종착점에는 다음 분기가 없습니다.');
    s.choiceId = randomUUID(); this.phase('CHOICE_WAIT', this.config.choiceMs);
    this.log('choice', '두 갈래 길을 만났습니다. 선택하지 않아도 모험은 계속됩니다.');
  }
  enterRegion(region) {
    const s = this.state; s.completed++; s.mapId = region; s.theme = region;
    s.currentNodeId = s.maps[region].rootId;
    if (!s.checkpointHistory.some(c => c.mapId === region && c.nodeId === s.currentNodeId)) s.checkpointHistory.push({ mapId: region, nodeId: s.currentNodeId, firstPassedAt: Date.now() });
    s.step = 0; s.path = []; s.hp = stats(s, this.config).maxHp; s.enemy = null; s.battle = null;
    this.phase('HOME', this.config.homeMs);
    this.log('checkpoint', `${MAP_DEFS[region].name}에 도착했습니다. 지역 출발점에 도착하여 체크포인트 통과 이력만 기록했습니다.`);
  }
  reward(kind) {
    const s = this.state, treasure = kind === 'treasure', boss = kind === 'boss', tune = this.config.balance;
    const bossRewardId = `${s.run}:${s.mapId}:${s.currentNodeId}`;
    if (boss && s.lastBossRewardId === bossRewardId) return;
    if (boss) { s.lastBossRewardId = bossRewardId; s.bossDefeats++; s.pendingBossReturn = true; }
    const xp = (boss ? tune.bossXP : treasure ? tune.treasureXP : tune.battleXP) + s.risk * tune.riskXP, gold = (boss ? tune.bossGold : treasure ? tune.treasureGold : tune.battleGold) + s.risk * tune.riskGold;
    s.xp += xp; s.gold += gold;
    if (treasure) s.chests++; else s.victories++;
    const item = this.item(['weapon', 'armor', 'charm'][this.rng(3)], this.rng(100) < tune.rareChance + s.risk * tune.riskRareChance ? 2 : this.rng(2));
    // Inventory deliberately has no silent cap or automatic sale.
    s.inventory.push(item);
    this.log(kind, `${boss ? '보스 격파' : treasure ? '보물 발견' : '전투 승리'} · 경험치 +${xp}, 금화 +${gold}, ${item.rarity} ${item.name}`, { xp, gold, itemId: item.id });
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
    s.enemy = { boss, name: boss ? MAP_DEFS[s.mapId].boss : names[s.theme], hp: maxHp, maxHp, STR: 1, ACC: 3 + lb, DEF: 3 + lb, REF: 4 + lb, WIL: 2 + lb, FOR: 4 + lb, AR: 2 + s.risk, PEN: 2, DEX: this.config.initiative.enemyDEX + (boss ? 1 : 0), base: Math.floor((tune.enemyDamage + s.risk * tune.enemyRiskDamage) * (boss ? tune.bossDamageMultiplier : 1)) };
    const heroDEX = stats(s, this.config).DEX;
    const first = heroDEX > s.enemy.DEX ? 'hero' : heroDEX < s.enemy.DEX ? 'enemy' : this.config.initiative.tieWinner;
    s.battle = { turn: 1, actor: first, firstActor: first, ap: 3, attacks: 0, lastHit: null };
    this.phase('BATTLE', this.config.battleActionMs); this.log('battle', `${s.enemy.name} 등장! ${first === 'hero' ? '모험가' : '몬스터'} 선공 (DEX ${heroDEX}:${s.enemy.DEX})으로 시작합니다.`);
  }
  battleAction() {
    const s = this.state, b = s.battle, hero = stats(s, this.config), enemy = s.enemy, tune = this.config.balance;
    const isHero = b.actor === 'hero', attacker = isHero ? hero : enemy, defender = isHero ? enemy : hero;
    const strong = isHero && b.ap >= 2 && s.tactic !== 'careful';
    const cost = strong ? 2 : 1, wizard = s.classId === 'wizard';
    const target = isHero && wizard ? (s.tactic === 'pierce' ? 'WIL' : 'REF') : 'DEF';
    const pen = attacker.PEN + (strong ? tune.strongPenBonus : 0) + (isHero && s.tactic === 'pierce' ? tune.piercePenBonus : 0);
    const base = isHero ? (wizard ? (strong ? tune.wizardStrong : tune.wizardBasic) : (strong ? tune.warriorStrong : tune.warriorBasic)) + hero.power : enemy.base;
    const result = attack({ roll: this.rng(20) + 1, acc: attacker.ACC - Math.min(10, b.attacks * 5) + (isHero && s.tactic === 'careful' ? tune.carefulAccuracy : 0), defense: defender[target], str: attacker.STR, base, pen, ar: defender.AR });
    const ability = isHero ? (wizard ? (target === 'WIL' ? '정신 파동' : strong ? '별빛 폭발' : '마력 화살') : strong ? '강타' : '베기') : '몸통 박치기';
    if (isHero) enemy.hp = Math.max(0, enemy.hp - result.damage); else s.hp = Math.max(0, s.hp - result.damage);
    b.ap -= cost; b.attacks++;
    b.lastHit = { ...result, actor: b.actor, ability, target, at: Date.now(), cost, ap: b.ap };
    this.log('hit', `${isHero ? '모험가' : enemy.name} · ${ability} ${result.label} ${result.damage} 피해 (d20 ${result.roll}, ${target}, ${cost} AP)`, { hit: b.lastHit });
    if (enemy.hp <= 0) { this.reward(enemy.boss ? 'boss' : 'victory'); return; }
    if (s.hp <= 0) { this.phase('DOWNED', this.config.downedMs); this.log('downed', '잠시 쓰러졌습니다. 장비와 금화는 안전합니다. 여관으로 귀환합니다.'); return; }
    if (b.ap === 0) { b.actor = isHero ? 'enemy' : 'hero'; b.ap = 3; b.attacks = 0; if (b.actor === b.firstActor) b.turn++; }
    this.phase('BATTLE', this.config.battleActionMs);
  }
  finish(downed, reason = 'deadend') {
    const s = this.state; s.completed++;
    s.lastSummary = { run: s.run, theme: s.theme, gold: s.gold - s.runGold, xp: s.eventSeq, steps: s.step, downed, reason, at: Date.now() };
    this.phase('RETURN_HOME', this.config.returnMs);
    this.log('return', `${downed ? '안전 귀환' : reason === 'boss' ? '보스 탐험 완료' : '막다른 길 도착'} · ${s.run}번째 여행에서 금화 ${s.lastSummary.gold}개를 모았습니다. 다음 여행이 곧 시작됩니다.`);
    s.enemy = null; s.battle = null;
  }
  advance() {
    const s = this.state;
    switch (s.phase) {
      case 'HOME':
        s.run++; s.runGold = s.gold; s.step = 0; s.path = []; s.pendingBossReturn = false;
        s.theme = s.mapId; s.currentNodeId = s.maps[s.mapId].rootId;
        this.log('depart', `${s.run}번째 여행 · ${MAP_DEFS[s.mapId].name} 출발점에서 모험을 시작합니다.`); this.nextChoice(); break;
      case 'CHOICE_WAIT': this.choose(this.rng(2) ? 'right' : 'left', true); break;
      case 'TRAVEL': {
        const node = s.maps[s.mapId].nodes[s.currentNodeId];
        if (node.kind === 'deadend') this.finish(false);
        else if (node.kind === 'exit') this.enterRegion(node.region);
        else if (node.kind === 'boss') this.beginBattle(true);
        else if (node.event === 'battle') this.beginBattle();
        else if (node.event === 'treasure') this.reward('treasure');
        else { this.log('pass', '조용한 길을 지나 다음 갈림길에 도착했습니다.'); this.nextChoice(); }
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
    else if (['EQUIP', 'UNEQUIP', 'SELL'].includes(cmd.type)) {
      const item = s.inventory.find(i => i.id === cmd.itemId); if (!item) throw Error('이미 판매했거나 없는 아이템입니다.');
      if (cmd.type === 'EQUIP') { if (item.classId && item.classId !== s.classId) throw Error('현재 직업으로 장착할 수 없습니다.'); s.equipment[item.slot] = item.id; this.log('equip', `${item.name} 장착 · 다음 공격부터 적용됩니다.`); }
      else if (cmd.type === 'UNEQUIP') { if (s.equipment[item.slot] !== item.id) throw Error('장착 중인 아이템이 아닙니다.'); delete s.equipment[item.slot]; this.log('equip', `${item.name} 장착 해제`); }
      else { if (Object.values(s.equipment).includes(item.id)) throw Error('장착 해제 후 판매할 수 있습니다.'); s.inventory = s.inventory.filter(i => i.id !== item.id); s.gold += item.value; this.log('sell', `${item.name} 판매 · 금화 +${item.value}`); }
      s.hp = Math.min(s.hp, stats(s, this.config).maxHp);
    } else if (cmd.type === 'TACTIC') { if (!['balanced', 'careful', 'pierce'].includes(cmd.tactic)) throw Error('잘못된 전술입니다.'); s.tactic = cmd.tactic; this.log('tactic', '자동 전투 전술을 변경했습니다.'); }
    else if (cmd.type === 'CLASS') {
      if (s.phase !== 'HOME') throw Error('직업 변경은 여관에서 가능합니다.');
      if (!this.config.classes[cmd.classId]) throw Error('잘못된 클래스입니다.');
      if (s.classId === cmd.classId) return;
      s.classId = cmd.classId;
      let weapon = s.inventory.find(i => i.slot === 'weapon' && i.classId === s.classId);
      if (!weapon) { weapon = this.item('weapon'); s.inventory.push(weapon); }
      s.equipment.weapon = weapon.id; s.hp = stats(s, this.config).maxHp; this.log('class', `${this.config.classes[s.classId].name}로 전직했습니다. 레벨과 수집품은 유지됩니다.`);
    } else throw Error('지원하지 않는 명령입니다.');
  }
  snapshot() { if (!this.state) return null; const { maps, ...state } = this.state; return { ...structuredClone(state), mapGraph: structuredClone(maps[state.mapId]), currentNode: structuredClone(maps[state.mapId].nodes[state.currentNodeId]), stats: stats(this.state, this.config), xpNext: this.state.level * this.config.xpPerLevel }; }
}
