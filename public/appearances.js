// Shared by the server and client. Add future class assignments here.
export const APPEARANCES = [
  { id: 'warrior', name: '전사', classId: 'warrior', assetVersion: 'playback-v1' },
  { id: 'wizard', name: '마법사', classId: 'wizard', assetVersion: 'playback-v1' },
  { id: 'barbarian', name: '바바리안', classId: 'warrior', assetVersion: 'playback-v1' },
  { id: 'ranger', name: '레인저', classId: 'warrior', assetVersion: 'playback-v1' },
  { id: 'cat', name: '고양이', classId: 'warrior', assetVersion: 'playback-v1' },
  { id: 'lamia', name: '라미아', classId: 'warrior', assetVersion: 'playback-v1' }
];
export const findAppearance = id => APPEARANCES.find(item => item.id === id);
export const defaultAppearance = classId => APPEARANCES.find(item => item.classId === classId) || APPEARANCES[0];
export const appearanceFor = state => findAppearance(state?.appearanceId) || defaultAppearance(state?.classId);
export const appearanceAssets = id => `/assets/${id}`;

export function restRemaining(state, receivedAt, now, rate = 1) {
  return state?.phase === 'HOME' ? Math.max(0, state.remaining - Math.max(0, now - receivedAt) * rate) : 0;
}

// Side source art may face left (Cat/Lamia); front poses must never be flipped.
export function mirrorAppearance(meta, motion) {
  return motion.action.startsWith('Side_') && ((meta.facing === 'left') !== motion.mirrored);
}
