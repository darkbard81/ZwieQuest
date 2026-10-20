import { DEFAULT_PROBABILITIES } from './probabilities.js';
// One exclusive roll per ordinary path arrival; terminal nodes keep their own rules.
export function rollEncounter(rng, probabilities = DEFAULT_PROBABILITIES) {
  const roll = rng(10000);
  return roll < probabilities.battlePercent * 100 ? 'battle'
    : roll < (probabilities.battlePercent + probabilities.treasurePercent) * 100 ? 'treasure' : 'pass';
}
