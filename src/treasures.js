import { randomUUID } from 'node:crypto';

export const TREASURES = Object.freeze([
  Object.freeze({ id: 'welcome-title', id_sort: 10, name: '환영합니다', price: 0, imagePath: '/assets/treasures/welcome-title-v1.webp', description: 'ZwieQuest의 몬스터들이 모인 환영 타이틀. 보물상자 아이콘을 누르면 크게 볼 수 있습니다.' }),
  Object.freeze({ id: 'tutorial-introduction', id_sort: 20, name: '01. 게임의 소개', price: 0, imagePath: '/assets/treasures/tutorial-introduction-v1.webp', description: '엘프 접수원이 안내하는 ZwieQuest의 첫 모험. 보물상자 아이콘을 누르면 4컷 소개 만화를 크게 볼 수 있습니다.' })
]);
export function treasureOffers(state) {
  return TREASURES.filter(def => !state.inventory.some(item => item.slot === 'treasure' && item.templateId === def.id)).sort((a, b) => a.id_sort - b.id_sort).map(def => ({ ...def }));
}
export function treasureItemView(item) {
  if (item.slot !== 'treasure') return item;
  const def = TREASURES.find(def => def.id === item.templateId);
  return { ...item, id_sort: def?.id_sort ?? Number.MAX_SAFE_INTEGER };
}
export function buyTreasure(state, treasureId) {
  const def = TREASURES.find(def => def.id === treasureId);
  if (!def) throw Error('구입할 수 없는 보물입니다.');
  if (state.inventory.some(item => item.slot === 'treasure' && item.templateId === def.id)) return null;
  if (state.gold < def.price) throw Error('금화가 부족합니다.');
  const item = { id: randomUUID(), templateId: def.id, id_sort: def.id_sort, slot: 'treasure', name: def.name, icon: 'chest', imagePath: def.imagePath, description: def.description, value: 0, stats: {} };
  state.gold -= def.price;
  state.inventory.push(item);
  return { item, price: def.price };
}
