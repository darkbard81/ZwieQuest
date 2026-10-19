// Keep 512×384 logical coordinates; stacked windows scale the whole playfield.
export function desktopLayout(width, height, controlsHeight = 0) {
  const stacked = width < 806; // 514px playfield window + 12px gap + 280px information.
  const worldWidth = stacked ? Math.max(2, width) : 514;
  const worldScale = (worldWidth - 2) / 512;
  const worldHeight = 38 + 384 * worldScale;
  const leftHeight = worldHeight + (controlsHeight > 0 ? 12 + controlsHeight : 0);
  const details = stacked ? Math.max(422, Math.min(640, height)) : Math.max(leftHeight, height);
  return { stacked, worldWidth, worldHeight, worldScale, details, height: stacked ? leftHeight + 12 + details : details };
}
