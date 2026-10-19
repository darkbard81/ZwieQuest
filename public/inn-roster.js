// Shared coordinates keep accessible hit targets aligned with the Pixi characters.
export function innRoster(characters = []) {
  return characters.map((character, index) => ({
    ...character, x: 256 + (index - (characters.length - 1) / 2) * 148,
    y: 242, size: 154, targetTop: 96, targetWidth: 144, targetHeight: 178
  }));
}
