// Appearance IDs select art only; they never select statistics or growth.
export const APPEARANCES = [
  { id: 'warrior', name: '전사', assetVersion: 'source512-lossless-v3' },
  { id: 'wizard', name: '마법사', assetVersion: 'source512-lossless-v3' },
  { id: 'barbarian', name: '바바리안', assetVersion: 'source512-lossless-v3' },
  { id: 'ranger', name: '레인저', assetVersion: 'source512-lossless-v3' },
  { id: 'cat', name: '고양이', assetVersion: 'source512-lossless-v3' },
  { id: 'lamia', name: '라미아', assetVersion: 'source512-lossless-v3' }
];
export const findAppearance = id => APPEARANCES.find(item => item.id === id);
export const defaultAppearance = appearanceId => APPEARANCES.find(item => item.id === appearanceId) || APPEARANCES[0];
export const appearanceFor = state => findAppearance(state?.appearanceId) || defaultAppearance();
export const appearanceAssets = id => `/assets/${id}`;

export function restRemaining(state, receivedAt, now, rate = 1) {
  return state?.phase === 'HOME' ? Math.max(0, state.remaining - Math.max(0, now - receivedAt) * rate) : 0;
}

// Side source art may face left (Cat/Lamia); front poses must never be flipped.
export function mirrorAppearance(meta, motion) {
  return motion.action.startsWith('Side_') && ((meta.facing === 'left') !== motion.mirrored);
}
