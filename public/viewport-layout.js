// Window border boxes include the fixed 512×384 playfield and its title bar.
export function desktopLayout(width, height, controlsHeight = 0) {
  const stacked = width < 806; // 514px playfield window + 12px gap + 280px information.
  const leftHeight = 422 + (controlsHeight > 0 ? 12 + controlsHeight : 0);
  const details = stacked ? Math.max(422, Math.min(640, height)) : Math.max(leftHeight, height);
  return { stacked, details, height: stacked ? leftHeight + 12 + details : details };
}
