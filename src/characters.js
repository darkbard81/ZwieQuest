import { randomUUID } from 'node:crypto';
import { BASE_STATS } from './equipment.js';
import { findAppearance, defaultAppearance } from '../public/appearances.js';

export const CHARACTER_VERSION = 1;
export const MAX_CHARACTERS = 3;
export const activeCharacter = state => state?.characters?.find(c => c.id === state.activeCharacterId) || null;
export const pointBudget = level => 10 + Math.floor(level / 2);
export const remainingPoints = character => character ? pointBudget(character.level) - BASE_STATS.reduce((sum, key) => sum + character.attributes[key], 0) : 0;
export const equipmentUsers = (state, itemId) => state.characters.filter(c => Object.values(c.equipment).includes(itemId)).map(c => c.id);
export function validateName(name) {
  if (typeof name !== 'string') throw Error('캐릭터 이름을 입력하세요.');
  const value = name.normalize('NFC').trim();
  if ([...value].length < 1 || [...value].length > 20 || /[\p{Cc}\p{Cf}]/u.test(value)) throw Error('이름은 제어문자 없이 1~20자로 입력하세요.');
  return value;
}
export function newCharacter(name, appearanceId) {
  if (!findAppearance(appearanceId)) throw Error('목록에 있는 외형을 선택하세요.');
  return { id: randomUUID(), name: validateName(name), appearanceId, level: 1, xp: 0, hp: null,
    attributes: Object.fromEntries(BASE_STATS.map(key => [key, 0])), equipment: {}, skills: [],
    skillSlots: Array(6).fill(null), skillCooldowns: {}, skillGrants: [] };
}
// Only legacy saves enter this branch. Active references take precedence over
// duplicate inactive references; every physical item stays in the shared bag.
export function migrateCharacters(state) {
  if (state.characterVersion === CHARACTER_VERSION) return false;
  if (state.characterVersion != null) throw Error('지원하지 않는 캐릭터 저장 버전입니다.');
  const currentClass = state.classId;
  const current = newCharacter(findAppearance(state.appearanceId)?.name || '기존 모험가', findAppearance(state.appearanceId)?.id || defaultAppearance(currentClass).id);
  Object.assign(current, { level: state.level, xp: state.xp, hp: state.hp, equipment: { ...state.equipment },
    skills: state.inventory.filter(i => i.slot === 'skill'), skillSlots: state.skillSlots || Array(6).fill(null), skillCooldowns: state.skillCooldowns || {}, skillGrants: state.skillGrants || [] });
  const characters = [current];
  const used = new Set(Object.values(current.equipment));
  for (const [id, profile] of Object.entries(state.inactiveClasses || {})) {
    if (id === currentClass || characters.length === MAX_CHARACTERS) continue;
    const appearance = defaultAppearance(id), character = newCharacter(`기존 ${appearance.name}`, appearance.id);
    character.level = profile.level; character.xp = profile.xp;
    for (const [slot, itemId] of Object.entries(profile.equipment || {})) if (!used.has(itemId)) { character.equipment[slot] = itemId; used.add(itemId); }
    characters.push(character);
  }
  state.inventory = state.inventory.filter(i => i.slot !== 'skill');
  Object.assign(state, { characters, activeCharacterId: current.id, characterVersion: CHARACTER_VERSION, homePaused: false });
  for (const key of ['classId', 'appearanceId', 'level', 'xp', 'hp', 'equipment', 'inactiveClasses', 'skillSlots', 'skillCooldowns', 'skillGrants', 'tactic']) delete state[key];
  return true;
}
export function allocatePoint(character, stat) {
  if (!BASE_STATS.includes(stat)) throw Error('잘못된 기본 능력치입니다.');
  if (remainingPoints(character) < 1) throw Error('남은 능력치 포인트가 없습니다.');
  character.attributes[stat]++;
}
