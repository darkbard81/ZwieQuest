// UI data is loaded from the server's data-templates/regions.json source.
export const REGIONS = {};
export async function loadRegions() {
  const response = await fetch('/api/regions', { cache: 'no-store' });
  if (!response.ok) throw Error('지역 설정을 불러오지 못했습니다.');
  const regions = await response.json();
  for (const id of Object.keys(REGIONS)) delete REGIONS[id];
  Object.assign(REGIONS, regions);
  return REGIONS;
}
