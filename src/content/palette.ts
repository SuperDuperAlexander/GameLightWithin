/**
 * Palette for "Light Within". Every colour used by the world and the UI lives here.
 * Values come straight from the chapter 1 art direction.
 */
export const PALETTE = {
  startGrey: '#9AA0A7',
  skyGrey: '#CFD2D6',
  receiveGold: '#E8B84B',
  sun: '#F2C14E',
  blockage: '#4A5578',
  growthGreen: '#74B28D',
  deepGreen: '#3E8E69',
  farHillsViolet: '#B9A7D8',
  heartRose: '#E98BA3',
  warmSky: '#F5DCC0',
} as const;

export type PaletteKey = keyof typeof PALETTE;

/** Convert a palette hex string to a linear-ish 0..1 triple for shader uniforms. */
export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
