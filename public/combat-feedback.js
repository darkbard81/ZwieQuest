// Consume the server event sequence, including final blows whose battle has ended.
// Initial/reconnected snapshots establish a baseline and never replay their backlog.
export function createHitFeed() {
  let lastSeq = null;
  return {
    consume(snapshot, connected) {
      const seq = snapshot.state?.eventSeq;
      if (!Number.isSafeInteger(seq)) { lastSeq = null; return null; }
      if (!connected || lastSeq === null) { lastSeq = seq; return null; }
      if (seq <= lastSeq) return null;
      const previous = lastSeq; lastSeq = seq;
      const latest = (snapshot.logs || []).filter(e => e.type === 'hit' && e.seq > previous && e.seq <= seq)
        .sort((a, b) => b.seq - a.seq)[0];
      // Suppress delayed/history-only results; compare server timestamps, not the client clock.
      const age = snapshot.serverTime - latest?.at;
      return latest?.hit && age >= 0 && age <= 2500 ? latest.hit : null;
    }
  };
}
