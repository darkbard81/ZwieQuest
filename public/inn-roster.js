// Shared coordinates keep accessible hit targets aligned with the Pixi characters.
export function innRoster(characters = []) {
  return characters.map((character, index) => ({
    ...character, x: 256 + (index - (characters.length - 1) / 2) * 148,
    y: 294, size: 256, targetTop: 58, targetWidth: 144, targetHeight: 256
  }));
}
