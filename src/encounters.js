// One exclusive roll on arrival: 12.5% battle, 12.5% treasure, 75% quiet path.
export function rollEncounter(rng) {
  const roll = rng(10000);
  return roll < 1250 ? 'battle' : roll < 2500 ? 'treasure' : 'pass';
}
