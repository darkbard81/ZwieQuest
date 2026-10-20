export function simulateBattle(game, limitMs = 120000) {
  let elapsed = 0, battleTimeMs = 0, heroActions = 0, enemyActions = 0, damage = 0, criticals = 0;
  while (game.state.phase === 'BATTLE' && elapsed < limitMs) {
    const dt = Math.min(200, limitMs - elapsed); game.events = []; game.tick(dt, 1); elapsed += dt;
    for (const { hit } of game.events.filter(e => e.type === 'hit')) {
      battleTimeMs = hit.combatTimeMs;
      if (hit.actor === 'hero') { heroActions++; damage += hit.damage; if (hit.tier === 3) criticals++; }
      else enemyActions++;
    }
  }
  const capped = game.state.phase === 'BATTLE';
  if (capped) battleTimeMs = limitMs;
  return { battleTimeMs, heroActions, enemyActions, damage, criticals, capped, won: game.state.phase === 'TREASURE' };
}
