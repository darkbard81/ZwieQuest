// Appearance IDs select art only; they never select statistics or growth.
export const APPEARANCES = [
  { id: 'warrior', name: '전사', assetVersion: 'source512-lossless-v3' },
  { id: 'wizard', name: '마법사', assetVersion: 'source512-lossless-v3' },
  { id: 'barbarian', name: '바바리안', assetVersion: 'source512-lossless-v3' },
  { id: 'ranger', name: '레인저', assetVersion: 'source512-lossless-v3' },
  { id: 'cat', name: '고양이', assetVersion: 'source512-lossless-v3' },
  { id: 'kitsune', name: '키츠네', assetVersion: '20261023-q90-v1', rgbQuality: 90 },
  { id: 'satyr', name: '사티로스', assetVersion: '20261023-q90-v1', rgbQuality: 90 },
  { id: 'holstein', name: '홀스타인', assetVersion: '20261023-q90-v1', rgbQuality: 90 },
  { id: 'bunnyfolk', name: '버니포크', assetVersion: '20261023-q90-v1', rgbQuality: 90 },
  { id: 'dragonkin', name: '드래곤킨', assetVersion: '20261023-q90-v2', rgbQuality: 90 },
  { id: 'werwolf', name: '웨어울프', assetVersion: '20261023-q90-v1', rgbQuality: 90 },
  { id: 'android', name: '안드로이드', assetVersion: '20261023-q90-v1', rgbQuality: 90 },
  { id: 'wolfkin', name: '울프킨', assetVersion: '20261023-q90-v1', rgbQuality: 90 },
  { id: 'minotaur', name: '미노타우로스', assetVersion: '20261023-q90-v1', rgbQuality: 90 },
  { id: 'lamia', name: '라미아', assetVersion: 'source512-lossless-v3' }
];
export const findAppearance = id => APPEARANCES.find(item => item.id === id);
export const defaultAppearance = appearanceId => APPEARANCES.find(item => item.id === appearanceId) || APPEARANCES[0];
export const appearanceFor = state => findAppearance(state?.appearanceId) || defaultAppearance();
export const appearanceAssets = id => `/assets/character/${id}`;

export function restRemaining(state, receivedAt, now, rate = 1) {
  return state?.phase === 'HOME' ? Math.max(0, state.remaining - Math.max(0, now - receivedAt) * rate) : 0;
}

// Side source art may face left (Cat/Lamia/Satyr); front poses must never be flipped.
export function mirrorAppearance(meta, motion) {
  return motion.action.startsWith('Side_') && ((meta.facing === 'left') !== motion.mirrored);
}
