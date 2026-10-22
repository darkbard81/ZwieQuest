export const compareTreasureOrder = (a, b) => (a.id_sort ?? Number.MAX_SAFE_INTEGER) - (b.id_sort ?? Number.MAX_SAFE_INTEGER) || String(a.templateId || a.id).localeCompare(String(b.templateId || b.id));

const grades = ['normal', 'fine', 'excellent', 'superior', 'legendary'];

export function sortInventory(state, filter = 'all', hideOthers = false) {
  const active = new Set([...Object.values(state.equipment), ...(state.skillSlots || [])]);
  const equippedRank = item => active.has(item.id) ? 2 : state.equipmentUsers?.[item.id]?.length ? 1 : 0;
  return state.inventory.filter(item => (filter === 'all' || item.slot === filter)
    && (!hideOthers || item.slot === 'skill' || active.has(item.id) || !state.equipmentUsers?.[item.id]?.length)).slice().reverse()
    .sort((a, b) => equippedRank(b) - equippedRank(a) || grades.indexOf(b.gradeId) - grades.indexOf(a.gradeId) || (a.slot === 'treasure' && b.slot === 'treasure' ? compareTreasureOrder(a, b) : 0));
}
