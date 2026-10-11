import { ACCELERATION, PLAYER_RADIUS } from './constants';
import { MAP, MAP_H, MAP_W, type Box } from './map';

/**
 * Movement + collision shared by the authoritative server and client prediction.
 * Everything here is deterministic given the same inputs.
 */

const CELL = 1;

export class ColliderIndex {
  private cells: number[][] = [];
  private boxes: Box[] = [];
  private dynamic = new Map<string, Box[]>();

  constructor(statics: Box[]) {
    for (let i = 0; i < (MAP_W + 2) * (MAP_H + 2); i++) this.cells.push([]);
    for (const b of statics) this.insert(b);
  }

  private insert(b: Box): number {
    const id = this.boxes.length;
    this.boxes.push(b);
    const cx0 = Math.max(-1, Math.floor(b.x0 / CELL));
    const cx1 = Math.min(MAP_W, Math.floor(b.x1 / CELL));
    const cy0 = Math.max(-1, Math.floor(b.y0 / CELL));
    const cy1 = Math.min(MAP_H, Math.floor(b.y1 / CELL));
    for (let y = cy0; y <= cy1; y++) for (let x = cx0; x <= cx1; x++) this.cells[(y + 1) * (MAP_W + 2) + (x + 1)].push(id);
    return id;
  }

  /** Dynamic colliders (locked doors) are checked separately and can be toggled. */
  setDynamic(key: string, boxes: Box[] | null): void {
    if (boxes) this.dynamic.set(key, boxes);
    else this.dynamic.delete(key);
  }

  hasDynamic(key: string): boolean {
    return this.dynamic.has(key);
  }

  query(x: number, y: number, r: number, out: Box[]): Box[] {
    out.length = 0;
    const seen = new Set<number>();
    const cx0 = Math.max(-1, Math.floor((x - r) / CELL));
    const cx1 = Math.min(MAP_W, Math.floor((x + r) / CELL));
    const cy0 = Math.max(-1, Math.floor((y - r) / CELL));
    const cy1 = Math.min(MAP_H, Math.floor((y + r) / CELL));
    for (let cy = cy0; cy <= cy1; cy++)
      for (let cx = cx0; cx <= cx1; cx++) {
        for (const id of this.cells[(cy + 1) * (MAP_W + 2) + (cx + 1)]) {
          if (seen.has(id)) continue;
          seen.add(id);
          out.push(this.boxes[id]);
        }
      }
    for (const list of this.dynamic.values()) for (const b of list) out.push(b);
    return out;
  }
}

export function createColliders(): ColliderIndex {
  return new ColliderIndex(MAP.staticColliders);
}

const scratch: Box[] = [];

function circleBoxPush(x: number, y: number, r: number, b: Box): [number, number] | null {
  const cx = Math.max(b.x0, Math.min(x, b.x1));
  const cy = Math.max(b.y0, Math.min(y, b.y1));
  const dx = x - cx;
  const dy = y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return null;
  if (d2 > 1e-12) {
    const d = Math.sqrt(d2);
    const push = r - d;
    return [(dx / d) * push, (dy / d) * push];
  }
  // centre inside box: push out along the shallowest axis
  const left = x - b.x0 + r;
  const right = b.x1 - x + r;
  const up = y - b.y0 + r;
  const down = b.y1 - y + r;
  const m = Math.min(left, right, up, down);
  if (m === left) return [-left, 0];
  if (m === right) return [right, 0];
  if (m === up) return [0, -up];
  return [0, down];
}

/** Resolve any overlap of a circle with colliders. Returns corrected position. */
export function resolveCollisions(cols: ColliderIndex, x: number, y: number, r = PLAYER_RADIUS): [number, number] {
  for (let iter = 0; iter < 4; iter++) {
    let moved = false;
    for (const b of cols.query(x, y, r + 0.05, scratch)) {
      const p = circleBoxPush(x, y, r, b);
      if (p) {
        x += p[0];
        y += p[1];
        moved = true;
      }
    }
    if (!moved) break;
  }
  return [x, y];
}

export function collides(cols: ColliderIndex, x: number, y: number, r = PLAYER_RADIUS): boolean {
  for (const b of cols.query(x, y, r, scratch)) if (circleBoxPush(x, y, r, b)) return true;
  return false;
}

export interface MoveState {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/**
 * Advance a body one fixed step. `mx,my` is the desired world-space direction
 * (|m| <= 1). Velocity eases toward the target for smooth acceleration and
 * stopping; position is integrated with sub-steps and slide-along-wall collision.
 * `ghost` bodies ignore furniture/walls but stay inside the map.
 */
export function stepMovement(
  s: MoveState,
  mx: number,
  my: number,
  speed: number,
  dt: number,
  cols: ColliderIndex,
  ghost = false,
): MoveState {
  let len = Math.hypot(mx, my);
  if (!Number.isFinite(len)) {
    mx = 0;
    my = 0;
    len = 0;
  }
  if (len > 1) {
    mx /= len;
    my /= len;
  }
  const tvx = mx * speed;
  const tvy = my * speed;
  const k = Math.min(1, ACCELERATION * dt);
  let vx = s.vx + (tvx - s.vx) * k;
  let vy = s.vy + (tvy - s.vy) * k;
  if (Math.abs(vx) < 0.01 && tvx === 0) vx = 0;
  if (Math.abs(vy) < 0.01 && tvy === 0) vy = 0;
  // Never exceed the allowed speed, whatever the inputs.
  const vlen = Math.hypot(vx, vy);
  if (vlen > speed) {
    vx = (vx / vlen) * speed;
    vy = (vy / vlen) * speed;
  }
  let x = s.x;
  let y = s.y;
  const dist = Math.hypot(vx * dt, vy * dt);
  const steps = Math.max(1, Math.ceil(dist / 0.1));
  for (let i = 0; i < steps; i++) {
    x += (vx * dt) / steps;
    y += (vy * dt) / steps;
    if (ghost) {
      x = Math.max(0.5, Math.min(MAP_W - 0.5, x));
      y = Math.max(0.5, Math.min(MAP_H - 0.5, y));
    } else {
      [x, y] = resolveCollisions(cols, x, y);
    }
  }
  // Kill velocity components that are being blocked (prevents "sticky" walls).
  const actualVx = (x - s.x) / dt;
  const actualVy = (y - s.y) / dt;
  if (Math.abs(actualVx) < Math.abs(vx) * 0.25) vx = actualVx;
  if (Math.abs(actualVy) < Math.abs(vy) * 0.25) vy = actualVy;
  return { x, y, vx, vy };
}

// ---------------------------------------------------------------------------
// Line of sight (opaque walls only; glass and furniture do not block sight)
// ---------------------------------------------------------------------------

const LOS_RES = 4; // cells per tile
const LOS_W = MAP_W * LOS_RES;
const LOS_H = MAP_H * LOS_RES;
let opaque: Uint8Array | null = null;

function buildOpaque(): Uint8Array {
  const g = new Uint8Array(LOS_W * LOS_H);
  for (const w of MAP.walls) {
    if (w.glass) continue;
    for (let y = Math.floor(w.y0 * LOS_RES); y < Math.ceil(w.y1 * LOS_RES); y++)
      for (let x = Math.floor(w.x0 * LOS_RES); x < Math.ceil(w.x1 * LOS_RES); x++)
        if (x >= 0 && y >= 0 && x < LOS_W && y < LOS_H) g[y * LOS_W + x] = 1;
  }
  return g;
}

export function lineOfSight(ax: number, ay: number, bx: number, by: number): boolean {
  if (!opaque) opaque = buildOpaque();
  const d = Math.hypot(bx - ax, by - ay);
  const steps = Math.ceil(d * LOS_RES * 1.5);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = Math.floor((ax + (bx - ax) * t) * LOS_RES);
    const y = Math.floor((ay + (by - ay) * t) * LOS_RES);
    if (x < 0 || y < 0 || x >= LOS_W || y >= LOS_H) return false;
    if (opaque[y * LOS_W + x]) return false;
  }
  return true;
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

/**
 * Converts a screen-relative input (right/down) into the isometric world direction
 * so that pressing "up" always moves the character up the screen.
 */
export function screenToWorldDir(sx: number, sy: number): [number, number] {
  let wx = sx + sy;
  let wy = -sx + sy;
  const l = Math.hypot(wx, wy);
  if (l > 0) {
    wx /= l;
    wy /= l;
  }
  return [wx, wy];
}
