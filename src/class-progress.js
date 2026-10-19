// Active progress stays in the existing combat fields. Only inactive classes
// are stored here, so there is never a second, stale copy of active progress.
export function captureProgress(state) {
  return { level: state.level, xp: state.xp, equipment: { ...state.equipment } };
}

export function newProgress() {
  return { level: 1, xp: 0, equipment: {} };
}

export function initializeClassProgress(state) {
  state.inactiveClasses ||= {};
  // Legacy saves already contain all progress for their currently active class.
  delete state.inactiveClasses[state.classId];
}

export function switchClassProgress(state, classId) {
  if (classId === state.classId) return false;
  initializeClassProgress(state);
  const next = state.inactiveClasses[classId] || newProgress();
  state.inactiveClasses[state.classId] = captureProgress(state);
  delete state.inactiveClasses[classId];
  Object.assign(state, { classId }, structuredClone(next));
  return true;
}

export function equippedClassIds(state, itemId) {
  return Object.entries({ ...state.inactiveClasses, [state.classId]: state })
    .filter(([, profile]) => Object.values(profile.equipment).includes(itemId))
    .map(([classId]) => classId);
}

export function classProfiles(state, config) {
  return Object.fromEntries(Object.entries(config.classes).map(([id, cls]) => {
    const existing = id === state.classId ? captureProgress(state) : state.inactiveClasses?.[id];
    return [id, { ...structuredClone(existing || newProgress()), name: cls.name, started: !!existing }];
  }));
}
