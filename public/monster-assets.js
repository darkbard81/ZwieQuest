export function monsterAssetURL(path) {
  return /^public\/assets\/monster\/[a-z0-9/_-]+\.webp$/.test(path || '') ? path.slice('public'.length) : '';
}
