const grades = ['normal', 'fine', 'excellent', 'superior', 'legendary'];

export function sortInventory(state, filter = 'all') {
  const active = new Set(Object.values(state.equipment));
  const equippedRank = item => active.has(item.id) ? 2 : state.equipmentUsers?.[item.id]?.length ? 1 : 0;
  return state.inventory.filter(item => filter === 'all' || item.slot === filter).slice().reverse()
    .sort((a, b) => equippedRank(b) - equippedRank(a) || grades.indexOf(b.gradeId) - grades.indexOf(a.gradeId));
}
