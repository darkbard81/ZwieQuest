// Shared vector assets for character stats, equipment and combat logs.
const stats = new Set(['PEN', 'actionSpeed', 'LB', 'ACC', 'AR', 'DEF', 'REF', 'FOR', 'WIL', 'STR', 'CON', 'DEX', 'PER', 'INT', 'RES']);
const damage = new Set(['slash', 'pierce', 'blunt', 'fire', 'cold', 'lightning', 'corrosion', 'raw']);
export function uiIconHTML(group, id) {
  if (!(group === 'stat' ? stats : group === 'damage' ? damage : new Set()).has(id)) return '';
  return `<img class="ui-icon" src="/assets/ui-icons/${group}-${id}.svg" width="18" height="18" alt="" aria-hidden="true">`;
}
