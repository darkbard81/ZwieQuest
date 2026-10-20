// One cursor handles combat effects. History and reconnect baselines never replay.
export function createCombatFeed() {
  let lastSeq = null;
  return {
    consume(snapshot, connected) {
      const seq = snapshot.state?.eventSeq;
      if (!Number.isSafeInteger(seq)) { lastSeq = null; return []; }
      if (!connected || lastSeq === null) { lastSeq = seq; return []; }
      if (seq <= lastSeq) return [];
      const previous = lastSeq; lastSeq = seq;
      return (snapshot.logs || []).filter(e => {
        const age = snapshot.serverTime - e.at;
        const battleId = e.hit?.battleId ?? e.battleId;
        const current = snapshot.state?.battle?.id ?? snapshot.state?.lastBattleId;
        if (battleId && battleId !== current) return false;
        return ['hit', 'victory', 'boss'].includes(e.type) && e.seq > previous && e.seq <= seq && age >= 0 && age <= 2500;
      }).sort((a, b) => a.seq - b.seq);
    }
  };
}
// Compatibility for callers interested only in the latest hit label.
export function createHitFeed() {
  const feed = createCombatFeed();
  return { consume(snapshot, connected) { return feed.consume(snapshot, connected).filter(e => e.type === 'hit').at(-1)?.hit || null; } };
}
