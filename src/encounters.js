// One exclusive roll on arrival: 20% battle, 5% treasure, 75% quiet path.
export function rollEncounter(rng) {
  const roll = rng(10000);
  return roll < 2000 ? 'battle' : roll < 2500 ? 'treasure' : 'pass';
}
