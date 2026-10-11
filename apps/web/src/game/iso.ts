/** 2:1 isometric projection shared by every renderer. */
export const HW = 32; // half tile width (px)
export const HH = 16; // half tile height (px)
export const ZH = 30; // px per world unit of height
export const OX = 40 * HW + 96;
export const OY = 150;
export const WORLD_W = OX + 50 * HW + 96;
export const WORLD_H = OY + 90 * HH + 80;
export const WALL_Z = 1.55;

export function iso(x: number, y: number, z = 0): [number, number] {
  return [(x - y) * HW + OX, (x + y) * HH + OY - z * ZH];
}

/** Inverse projection for z = 0 (screen → world). */
export function unIso(sx: number, sy: number): [number, number] {
  const a = (sx - OX) / HW;
  const b = (sy - OY) / HH;
  return [(a + b) / 2, (b - a) / 2];
}

/** Painter's-algorithm depth for an object whose ground footprint centre is (x, y). */
export function depthOf(x: number, y: number): number {
  return (x + y) * 100;
}

/** Screen-relative input → world direction (W = up the screen). */
export function screenToWorld(sx: number, sy: number): [number, number] {
  let wx = sx + sy;
  let wy = -sx + sy;
  const l = Math.hypot(wx, wy);
  if (l > 0) {
    wx /= l;
    wy /= l;
  }
  return [wx, wy];
}
