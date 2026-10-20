// SSE normally updates the journal; explicit refreshes recover a missed snapshot.
export function createBestiarySync(view, fetchState) {
  let current = null, generation = 0, pending = null;
  function update(state) {
    if (!state || state.progressId !== current?.progressId) generation++;
    if (state && current?.progressId === state.progressId && state.version < current.version) return;
    current = state;
    view.update(state);
  }
  function refresh() {
    if (!current) return Promise.resolve();
    if (pending?.generation === generation) return pending.promise;
    const request = { generation, progressId: current.progressId };
    pending = request;
    request.promise = Promise.resolve().then(fetchState).then(({ state }) => {
      // A late response must not restore an old account, reset, or pre-battle entry.
      if (request.generation === generation && state?.progressId === request.progressId) update(state);
    }).finally(() => { if (pending === request) pending = null; });
    return request.promise;
  }
  return { update, refresh };
}
