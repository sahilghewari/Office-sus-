import { DOORS, FURNITURE, MAP, MAP_H, MAP_W, ROOMS, Tile, VENTS, type Furniture, type RoomDef, type WallPiece } from '@corp/shared';
import { shade } from './characterArt';
import { HH, HW, OX, OY, WALL_Z, WORLD_H, WORLD_W, ZH, iso } from './iso';

/**
 * Procedural, original environment art for NEXUS HQ, drawn with Canvas2D into
 * textures once at load. Every piece shares one light direction (top-left),
 * one outline colour and one palette so the office reads as a single art style.
 */

type V3 = [number, number, number];

export class Painter {
  constructor(
    public ctx: CanvasRenderingContext2D,
    public ox: number,
    public oy: number,
  ) {}

  P(x: number, y: number, z = 0): [number, number] {
    const [sx, sy] = iso(x, y, z);
    return [sx - this.ox, sy - this.oy];
  }

  poly(pts: V3[], fill: string | CanvasGradient, stroke: string | null = OUT, lw = 1) {
    const c = this.ctx;
    c.beginPath();
    pts.forEach((p, i) => {
      const [sx, sy] = this.P(p[0], p[1], p[2]);
      if (i === 0) c.moveTo(sx, sy);
      else c.lineTo(sx, sy);
    });
    c.closePath();
    c.fillStyle = fill;
    c.fill();
    if (stroke) {
      c.strokeStyle = stroke;
      c.lineWidth = lw;
      c.stroke();
    }
  }

  /** Axis-aligned box; draws the three faces visible from the camera. */
  box(x0: number, y0: number, x1: number, y1: number, z0: number, z1: number, base: string, o: { top?: string; left?: string; right?: string; stroke?: string | null; lw?: number } = {}) {
    const stroke = o.stroke === undefined ? OUT : o.stroke;
    const lw = o.lw ?? 1;
    // +x face (screen right)
    this.poly([[x1, y0, z1], [x1, y1, z1], [x1, y1, z0], [x1, y0, z0]], o.right ?? shade(base, -0.22), stroke, lw);
    // +y face (screen left)
    this.poly([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], o.left ?? base, stroke, lw);
    // top
    this.poly([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], o.top ?? shade(base, 0.14), stroke, lw);
  }

  /** Draw on the south (+y) face plane y = const, u → +x (1 unit = 1/32 tile), v ↓ from zTop. */
  faceS(x0: number, y: number, zTop: number, fn: (c: CanvasRenderingContext2D) => void) {
    const [bx, by] = this.P(x0, y, zTop);
    const c = this.ctx;
    c.save();
    c.transform(HW / 32, HH / 32, 0, ZH / 32, bx, by);
    fn(c);
    c.restore();
  }

  /** Draw on the east (+x) face plane x = const, u → −y (reads left→right on screen). */
  faceE(x: number, y1: number, zTop: number, fn: (c: CanvasRenderingContext2D) => void) {
    const [bx, by] = this.P(x, y1, zTop);
    const c = this.ctx;
    c.save();
    c.transform(HW / 32, -HH / 32, 0, ZH / 32, bx, by);
    fn(c);
    c.restore();
  }

  /** Draw on the top plane at z, u → +x, v → +y (1 unit = 1/32 tile). */
  top(x0: number, y0: number, z: number, fn: (c: CanvasRenderingContext2D) => void) {
    const [bx, by] = this.P(x0, y0, z);
    const c = this.ctx;
    c.save();
    c.transform(HW / 32, HH / 32, -HW / 32, HH / 32, bx, by);
    fn(c);
    c.restore();
  }

  ellipse(x: number, y: number, z: number, rx: number, ry: number, fill: string | CanvasGradient, stroke: string | null = OUT) {
    // an iso circle of radius r on the ground: screen ellipse rx*HW*√2, ry*HH*√2
    const [sx, sy] = this.P(x, y, z);
    const c = this.ctx;
    c.beginPath();
    c.ellipse(sx, sy, rx * HW * 1.41, ry * HH * 1.41, 0, 0, Math.PI * 2);
    c.fillStyle = fill;
    c.fill();
    if (stroke) {
      c.strokeStyle = stroke;
      c.lineWidth = 1;
      c.stroke();
    }
  }

  cylinder(x: number, y: number, r: number, z0: number, z1: number, base: string) {
    const c = this.ctx;
    const [sx, sy0] = this.P(x, y, z0);
    const [, sy1] = this.P(x, y, z1);
    const rx = r * HW * 1.41;
    const ry = r * HH * 1.41;
    const g = c.createLinearGradient(sx - rx, 0, sx + rx, 0);
    g.addColorStop(0, shade(base, 0.15));
    g.addColorStop(0.6, base);
    g.addColorStop(1, shade(base, -0.3));
    c.beginPath();
    c.ellipse(sx, sy0, rx, ry, 0, 0, Math.PI);
    c.lineTo(sx - rx, sy1);
    c.ellipse(sx, sy1, rx, ry, 0, Math.PI, 0, true);
    c.closePath();
    c.fillStyle = g;
    c.fill();
    c.strokeStyle = OUT;
    c.lineWidth = 1;
    c.stroke();
    c.beginPath();
    c.ellipse(sx, sy1, rx, ry, 0, 0, Math.PI * 2);
    c.fillStyle = shade(base, 0.2);
    c.fill();
    c.stroke();
  }
}

const OUT = 'rgba(22,20,48,0.55)';

// palette
export const PAL = {
  wood: '#e3b98c',
  woodDark: '#8a5a3c',
  walnut: '#6b4330',
  metal: '#9aa3b8',
  dark: '#252a3d',
  screen: '#2ee6f0',
  white: '#f3f4fa',
  gray: '#c3c8d8',
  navy: '#2b3a8f',
  purple: '#8a5cf6',
  mint: '#3ddc97',
  orange: '#ff8a3d',
  yellow: '#ffd23f',
  red: '#ef3e4a',
  cyan: '#2ee6f0',
  leaf: '#34c27f',
  leafDark: '#1f8f63',
};

// ---------------------------------------------------------------------------
// Floor
// ---------------------------------------------------------------------------

const FLOOR_COLORS: Record<string, [string, string]> = {
  concrete: ['#5a6178', '#535a70'],
  carpetBlue: ['#5a7fd6', '#5579cf'],
  marble: ['#eceaf2', '#e2e0ec'],
  carpetPurple: ['#9b84d9', '#9580d3'],
  carpetDark: ['#3b416a', '#373d64'],
  wood: ['#d9a877', '#d29f6e'],
  carpetConf: ['#4f5fb8', '#4a5ab0'],
  carpetNeon: ['#3a2a6e', '#352667'],
  tile: ['#c9d4e3', '#bccadb'],
  checker: ['#f2f2f2', '#ff9a52'],
  hazard: ['#6f7486', '#686d7f'],
  hall: ['#b9bed3', '#b3b8cd'],
};

export function drawFloor(quality: 'high' | 'low'): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = WORLD_W;
  cv.height = WORLD_H;
  const c = cv.getContext('2d')!;
  // Outside the building: soft night-city gradient
  const bg = c.createLinearGradient(0, 0, 0, WORLD_H);
  bg.addColorStop(0, '#141a3d');
  bg.addColorStop(1, '#0b0f2b');
  c.fillStyle = bg;
  c.fillRect(0, 0, WORLD_W, WORLD_H);
  const p = new Painter(c, 0, 0);

  // Building slab under everything (gives thickness to the diorama)
  const slab: V3[] = [[0, 0, 0], [MAP_W, 0, 0], [MAP_W, MAP_H, 0], [0, MAP_H, 0]];
  p.poly([[MAP_W, 0, 0], [MAP_W, MAP_H, 0], [MAP_W, MAP_H, -0.8], [MAP_W, 0, -0.8]], '#1d2558', null);
  p.poly([[0, MAP_H, 0], [MAP_W, MAP_H, 0], [MAP_W, MAP_H, -0.8], [0, MAP_H, -0.8]], '#283276', null);
  p.poly(slab, '#2a2f4f', null);

  const roomOf = (x: number, y: number): RoomDef | undefined => {
    const id = MAP.roomGrid[y * MAP_W + x];
    return id ? ROOMS.find((r) => r.id === id) : undefined;
  };

  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < MAP_W; x++) {
      const t = MAP.grid[y * MAP_W + x] as Tile;
      if (t === Tile.Void) continue;
      // wall tiles get the floor of a neighbour so the floor runs under thin walls
      let room = roomOf(x, y);
      if (!room) room = roomOf(x, y + 1) ?? roomOf(x + 1, y) ?? roomOf(x, y - 1) ?? roomOf(x - 1, y) ?? roomOf(x + 1, y + 1);
      const style = t === Tile.Door ? 'hall' : (room?.floor ?? 'hall');
      drawFloorTile(p, x, y, style, quality);
    }

  // Rugs (decorative, walkable)
  for (const f of FURNITURE) if (f.kind === 'rug') drawRug(p, f);

  // Hallway runner carpets
  for (const r of ROOMS.filter((rr) => rr.isHall)) {
    p.poly([[r.x0 + 0.3, r.y0 + 0.55, 0], [r.x1 + 0.7, r.y0 + 0.55, 0], [r.x1 + 0.7, r.y1 + 0.45, 0], [r.x0 + 0.3, r.y1 + 0.45, 0]], 'rgba(61,123,255,0.22)', null);
    p.poly([[r.x0 + 0.3, r.y0 + 0.62, 0], [r.x1 + 0.7, r.y0 + 0.62, 0], [r.x1 + 0.7, r.y0 + 0.68, 0], [r.x0 + 0.3, r.y0 + 0.68, 0]], 'rgba(255,255,255,0.25)', null);
    p.poly([[r.x0 + 0.3, r.y1 + 0.32, 0], [r.x1 + 0.7, r.y1 + 0.32, 0], [r.x1 + 0.7, r.y1 + 0.38, 0], [r.x0 + 0.3, r.y1 + 0.38, 0]], 'rgba(255,255,255,0.25)', null);
  }

  // Door thresholds
  for (const d of DOORS) {
    for (const [x, y] of d.tiles) {
      if (d.orient === 'h') p.poly([[x, y + 0.3, 0], [x + 1, y + 0.3, 0], [x + 1, y + 0.7, 0], [x, y + 0.7, 0]], d.lockable ? 'rgba(255,210,63,0.35)' : 'rgba(255,255,255,0.28)', null);
      else p.poly([[x + 0.3, y, 0], [x + 0.7, y, 0], [x + 0.7, y + 1, 0], [x + 0.3, y + 1, 0]], d.lockable ? 'rgba(255,210,63,0.35)' : 'rgba(255,255,255,0.28)', null);
    }
  }

  // Ambient occlusion along walls
  if (quality === 'high') {
    for (const w of MAP.walls) {
      const g = 0.45;
      p.poly([[w.x0 - 0.05, w.y1, 0], [w.x1 + 0.05, w.y1, 0], [w.x1 + 0.05, w.y1 + g, 0], [w.x0 - 0.05, w.y1 + g, 0]], 'rgba(10,10,40,0.10)', null);
      p.poly([[w.x1, w.y0 - 0.05, 0], [w.x1 + g, w.y0 - 0.05, 0], [w.x1 + g, w.y1 + 0.05, 0], [w.x1, w.y1 + 0.05, 0]], 'rgba(10,10,40,0.10)', null);
    }
  }

  // Maintenance hatches (vents) are part of the floor
  for (const v of VENTS) drawVent(p, v.x, v.y);

  // Room name decals on the floor (subtle wayfinding)
  c.save();
  c.font = '700 22px Fredoka, sans-serif';
  c.textAlign = 'center';
  for (const r of ROOMS) {
    if (r.isHall) continue;
    const cx = (r.x0 + r.x1 + 1) / 2;
    const cy = r.y1 + 0.55;
    p.top(cx - 3, cy - 0.15, 0.01, (cc) => {
      cc.fillStyle = 'rgba(20,24,60,0.18)';
      cc.font = '700 13px Fredoka, sans-serif';
      cc.textAlign = 'center';
      cc.fillText(r.name.toUpperCase(), 96, 6);
    });
  }
  c.restore();
  return cv;
}

function hash(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function drawFloorTile(p: Painter, x: number, y: number, style: string, quality: 'high' | 'low') {
  const [a, b] = FLOOR_COLORS[style] ?? FLOOR_COLORS.hall;
  const h = hash(x, y);
  const checker = (x + y) % 2 === 0;
  let col = style === 'checker' ? (checker ? a : b) : checker ? a : b;
  if (style === 'checker' && !checker) col = '#ffd9bd';
  const pts: V3[] = [[x, y, 0], [x + 1, y, 0], [x + 1, y + 1, 0], [x, y + 1, 0]];
  p.poly(pts, col, style === 'wood' || style === 'tile' || style === 'marble' || style === 'checker' || style === 'hall' ? 'rgba(0,0,0,0.07)' : null, 1);
  if (quality === 'low') return;
  const c = p.ctx;
  switch (style) {
    case 'wood':
      for (let i = 1; i < 4; i++) p.poly([[x, y + i / 4, 0], [x + 1, y + i / 4, 0], [x + 1, y + i / 4 + 0.02, 0], [x, y + i / 4 + 0.02, 0]], 'rgba(120,70,30,0.18)', null);
      if (h > 0.6) p.poly([[x + h * 0.6, y + 0.1, 0], [x + h * 0.6 + 0.02, y + 0.1, 0], [x + h * 0.6 + 0.02, y + 0.35, 0], [x + h * 0.6, y + 0.35, 0]], 'rgba(120,70,30,0.15)', null);
      break;
    case 'marble':
      if (h > 0.55) {
        const [sx, sy] = p.P(x + 0.2, y + 0.3);
        const [ex, ey] = p.P(x + 0.8, y + 0.7);
        c.strokeStyle = 'rgba(150,150,190,0.25)';
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(sx, sy);
        c.quadraticCurveTo((sx + ex) / 2 + 8, (sy + ey) / 2 - 3, ex, ey);
        c.stroke();
      }
      break;
    case 'carpetBlue':
    case 'carpetPurple':
    case 'carpetDark':
    case 'carpetConf':
      for (let i = 0; i < 3; i++) {
        const u = hash(x + i, y * 3 + i);
        const v = hash(y + i, x * 7 + i);
        const [sx, sy] = p.P(x + u, y + v);
        c.fillStyle = 'rgba(255,255,255,0.06)';
        c.fillRect(sx, sy, 2, 1);
      }
      break;
    case 'carpetNeon':
      p.poly([[x, y, 0], [x + 1, y, 0], [x + 1, y + 0.03, 0], [x, y + 0.03, 0]], 'rgba(46,230,240,0.25)', null);
      p.poly([[x, y, 0], [x + 0.03, y, 0], [x + 0.03, y + 1, 0], [x, y + 1, 0]], 'rgba(255,111,181,0.22)', null);
      break;
    case 'concrete':
      p.poly([[x, y + 0.48, 0], [x + 1, y + 0.48, 0], [x + 1, y + 0.52, 0], [x, y + 0.52, 0]], 'rgba(46,230,240,0.08)', null);
      if (h > 0.7) p.poly([[x + 0.48, y, 0], [x + 0.52, y, 0], [x + 0.52, y + 1, 0], [x + 0.48, y + 1, 0]], 'rgba(46,230,240,0.08)', null);
      break;
    case 'hazard':
      if (h > 0.85) {
        const [sx, sy] = p.P(x + 0.5, y + 0.5);
        c.fillStyle = 'rgba(0,0,0,0.12)';
        c.beginPath();
        c.ellipse(sx, sy, 10, 4, 0.3, 0, Math.PI * 2);
        c.fill();
      }
      break;
    case 'tile':
      p.poly([[x + 0.5, y, 0], [x + 0.52, y, 0], [x + 0.52, y + 1, 0], [x + 0.5, y + 1, 0]], 'rgba(0,0,0,0.05)', null);
      p.poly([[x, y + 0.5, 0], [x + 1, y + 0.5, 0], [x + 1, y + 0.52, 0], [x, y + 0.52, 0]], 'rgba(0,0,0,0.05)', null);
      break;
  }
}

function drawRug(p: Painter, f: Furniture) {
  const { x, y, w, h } = f;
  const pts: V3[] = [[x, y, 0.005], [x + w, y, 0.005], [x + w, y + h, 0.005], [x, y + h, 0.005]];
  switch (f.variant) {
    case 'cable':
      // cable tray in the server room floor
      p.poly(pts, '#2f3550', 'rgba(46,230,240,0.4)');
      for (let i = 0; i < 4; i++) p.poly([[x + 0.2 + i * 1.1, y + 0.1, 0.01], [x + 0.9 + i * 1.1, y + 0.1, 0.01], [x + 0.9 + i * 1.1, y + h - 0.1, 0.01], [x + 0.2 + i * 1.1, y + h - 0.1, 0.01]], i % 2 ? '#2ee6f0' : '#8a5cf6', null);
      break;
    case 'royal':
      p.poly(pts, '#7b2c4a', '#ffd23f', 2);
      p.poly([[x + 0.3, y + 0.3, 0.01], [x + w - 0.3, y + 0.3, 0.01], [x + w - 0.3, y + h - 0.3, 0.01], [x + 0.3, y + h - 0.3, 0.01]], '#94385a', 'rgba(255,210,63,0.6)', 1);
      break;
    case 'conf':
      p.poly(pts, 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.25)', 1.5);
      break;
    case 'neon':
      p.poly(pts, '#2a1d55', '#ff6fb5', 2);
      p.poly([[x + 0.25, y + 0.25, 0.01], [x + w - 0.25, y + 0.25, 0.01], [x + w - 0.25, y + h - 0.25, 0.01], [x + 0.25, y + h - 0.25, 0.01]], 'rgba(0,0,0,0)', '#2ee6f0', 1.5);
      break;
    case 'brand':
      p.poly(pts, '#2b3a8f', '#ffd23f', 2);
      p.top(x, y, 0.012, (c) => {
        c.fillStyle = '#ffd23f';
        c.font = '700 26px Fredoka, sans-serif';
        c.textAlign = 'center';
        c.fillText('NEXUS', (w * 32) / 2, (h * 32) / 2 + 9);
      });
      break;
  }
}

function drawVent(p: Painter, x: number, y: number) {
  const r = 0.36;
  p.poly([[x - r, y - r, 0.01], [x + r, y - r, 0.01], [x + r, y + r, 0.01], [x - r, y + r, 0.01]], '#4a5068', 'rgba(20,20,40,0.6)', 1.2);
  for (let i = 0; i < 5; i++) {
    const yy = y - r + 0.1 + i * 0.13;
    p.poly([[x - r + 0.08, yy, 0.012], [x + r - 0.08, yy, 0.012], [x + r - 0.08, yy + 0.05, 0.012], [x - r + 0.08, yy + 0.05, 0.012]], '#252a3d', null);
  }
}

// ---------------------------------------------------------------------------
// Static pieces (walls + furniture) rendered to individual textures
// ---------------------------------------------------------------------------

export interface Piece {
  key: string;
  canvas: HTMLCanvasElement;
  /** screen position of the canvas' top-left in world pixels */
  sx: number;
  sy: number;
  depthX: number;
  depthY: number;
  tall: boolean;
  wall?: WallPiece;
  furniture?: Furniture;
}

function makePiece(key: string, x0: number, y0: number, x1: number, y1: number, zTop: number, draw: (p: Painter) => void, cache: Map<string, HTMLCanvasElement>, extraTop = 18): { canvas: HTMLCanvasElement; sx: number; sy: number } {
  const corners = [iso(x0, y0, 0), iso(x1, y0, 0), iso(x0, y1, 0), iso(x1, y1, 0), iso(x0, y0, zTop), iso(x1, y0, zTop)];
  const minX = Math.floor(Math.min(...corners.map((c) => c[0]))) - 6;
  const maxX = Math.ceil(Math.max(...corners.map((c) => c[0]))) + 6;
  const minY = Math.floor(Math.min(...corners.map((c) => c[1]))) - extraTop;
  const maxY = Math.ceil(Math.max(...corners.map((c) => c[1]))) + 6;
  // Cache by shape relative to the tile grid so identical pieces share a texture.
  const fx = x0 - Math.floor(x0);
  const fy = y0 - Math.floor(y0);
  const ck = `${key}|${(x1 - x0).toFixed(2)}|${(y1 - y0).toFixed(2)}|${fx.toFixed(2)}|${fy.toFixed(2)}`;
  let canvas = cache.get(ck);
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = maxX - minX;
    canvas.height = maxY - minY;
    const ctx = canvas.getContext('2d')!;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    draw(new Painter(ctx, minX, minY));
    cache.set(ck, canvas);
  }
  return { canvas, sx: minX, sy: minY };
}

const WALL_BASE = '#dfe2f3';
const WALL_CAP = '#2b3a8f';

export function buildPieces(): Piece[] {
  const cache = new Map<string, HTMLCanvasElement>();
  const out: Piece[] = [];
  // walls
  for (const w of MAP.walls) {
    const key = `wall-${w.glass ? 'g' : 'w'}`;
    const z = WALL_Z;
    const { canvas, sx, sy } = makePiece(
      key,
      w.x0,
      w.y0,
      w.x1,
      w.y1,
      z,
      (p) => {
        if (w.glass) {
          p.box(w.x0 + 0.1, w.y0 + 0.1, w.x1 - 0.1, w.y1 - 0.1, 0, 0.12, '#9aa3b8', { stroke: null });
          p.box(w.x0, w.y0, w.x1, w.y1, 0.12, z, 'rgba(170,215,255,0.30)', {
            top: 'rgba(230,245,255,0.9)',
            right: 'rgba(140,190,240,0.32)',
            stroke: 'rgba(230,245,255,0.55)',
          });
          // reflection streak
          p.poly([[w.x0 + 0.1, w.y1, z * 0.85], [w.x0 + 0.25, w.y1, z * 0.85], [w.x0 + 0.05, w.y1, z * 0.25], [w.x0 - 0.1, w.y1, z * 0.25]], 'rgba(255,255,255,0.28)', null);
        } else {
          // No per-piece outlines: adjacent pieces merge into one continuous wall.
          p.box(w.x0, w.y0, w.x1, w.y1, 0, z, WALL_BASE, { top: WALL_CAP, right: '#b4b9d8', left: '#e6e9fa', stroke: null });
          // skirting board + chair rail
          p.poly([[w.x0, w.y1, 0.16], [w.x1, w.y1, 0.16], [w.x1, w.y1, 0], [w.x0, w.y1, 0]], '#8a92b8', null);
          p.poly([[w.x1, w.y0, 0.16], [w.x1, w.y1, 0.16], [w.x1, w.y1, 0], [w.x1, w.y0, 0]], '#737ba3', null);
          p.poly([[w.x0, w.y1, 0.62], [w.x1, w.y1, 0.62], [w.x1, w.y1, 0.57], [w.x0, w.y1, 0.57]], '#c9cdec', null);
          p.poly([[w.x1, w.y0, 0.62], [w.x1, w.y1, 0.62], [w.x1, w.y1, 0.57], [w.x1, w.y0, 0.57]], '#a2a8cc', null);
          // cap highlight
          p.poly([[w.x0, w.y1, z], [w.x1, w.y1, z], [w.x1, w.y1, z - 0.04], [w.x0, w.y1, z - 0.04]], '#4a5bc4', null);
          p.poly([[w.x1, w.y0, z], [w.x1, w.y1, z], [w.x1, w.y1, z - 0.04], [w.x1, w.y0, z - 0.04]], '#3a49a8', null);
        }
      },
      cache,
    );
    out.push({ key, canvas, sx, sy, depthX: (w.x0 + w.x1) / 2, depthY: (w.y0 + w.y1) / 2, tall: true, wall: w });
  }
  // furniture
  for (const f of FURNITURE) {
    if (f.kind === 'rug') continue;
    const z = f.z ?? 0.8;
    const { canvas, sx, sy } = makePiece(`${f.kind}-${f.variant ?? ''}`, f.x, f.y, f.x + f.w, f.y + f.h, z + 0.6, (p) => drawFurniture(p, f), cache, 28);
    out.push({ key: f.id, canvas, sx, sy, depthX: f.x + f.w / 2, depthY: f.y + f.h / 2, tall: z >= 1.2, furniture: f });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Furniture drawings
// ---------------------------------------------------------------------------

function monitor(p: Painter, x: number, y: number, facing: 's' | 'n', z: number, w = 0.55) {
  // stand
  p.box(x + w / 2 - 0.04, y - 0.04, x + w / 2 + 0.04, y + 0.04, z, z + 0.16, PAL.metal, { lw: 0.6 });
  const y0 = y - 0.04;
  const y1 = y + 0.04;
  p.box(x, y0, x + w, y1, z + 0.14, z + 0.52, '#1f2333', { lw: 0.8 });
  if (facing === 's') {
    p.faceS(x, y1, z + 0.52, (c) => {
      const W = w * 32;
      const H = 0.38 * 32;
      const g = c.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, '#3df0ff');
      g.addColorStop(1, '#5a6cff');
      c.fillStyle = g;
      c.fillRect(1.5, 1.5, W - 3, H - 3);
      c.fillStyle = 'rgba(255,255,255,0.75)';
      for (let i = 0; i < 4; i++) c.fillRect(3, 3 + i * 2.4, (W - 8) * (0.4 + ((i * 37) % 50) / 100), 1.1);
    });
  }
}

function legs(p: Painter, x0: number, y0: number, x1: number, y1: number, z: number, col = PAL.metal) {
  const t = 0.06;
  for (const [lx, ly] of [[x0 + 0.05, y0 + 0.05], [x1 - 0.05 - t, y0 + 0.05], [x0 + 0.05, y1 - 0.05 - t], [x1 - 0.05 - t, y1 - 0.05 - t]])
    p.box(lx, ly, lx + t, ly + t, 0, z, col, { lw: 0.5 });
}

function screenFace(p: Painter, x0: number, y: number, z: number, w: number, h: number, draw: (c: CanvasRenderingContext2D, W: number, H: number) => void) {
  p.faceS(x0, y, z, (c) => draw(c, w * 32, h * 32));
}

export function drawFurniture(p: Painter, f: Furniture) {
  const { x, y, w, h } = f;
  const x1 = x + w;
  const y1 = y + h;
  const z = f.z ?? 0.8;
  const v = f.variant ?? '';
  switch (f.kind) {
    case 'desk': {
      legs(p, x, y, x1, y1, 0.42);
      p.box(x, y, x1, y1, 0.42, 0.5, PAL.wood, { top: '#f0cfa6' });
      const south = v.endsWith('-s');
      // monitors along the far edge from the chair
      const my = south ? y + 0.2 : y1 - 0.2;
      monitor(p, x + 0.12, my, south ? 's' : 'n', 0.5, 0.58);
      monitor(p, x + 0.78, my, south ? 's' : 'n', 0.5, 0.58);
      // keyboard + mug + papers
      const ky = south ? y1 - 0.38 : y + 0.18;
      p.box(x + 0.45, ky, x + 1.0, ky + 0.16, 0.5, 0.53, '#e9ebf5', { lw: 0.5 });
      p.cylinder(x + 1.25, ky + 0.05, 0.07, 0.5, 0.62, ['#ef3e4a', '#3d7bff', '#ffd23f', '#3ddc97'][Math.floor((x * 7 + y * 3) % 4)]);
      p.box(x + 0.12, ky - 0.05, x + 0.38, ky + 0.25, 0.5, 0.515, '#ffffff', { lw: 0.4 });
      break;
    }
    case 'standingDesk': {
      p.box(x + 0.15, y + 0.3, x + 0.3, y + 0.6, 0, 0.92, PAL.metal);
      p.box(x1 - 0.3, y + 0.3, x1 - 0.15, y + 0.6, 0, 0.92, PAL.metal);
      p.box(x, y, x1, y1, 0.92, 0.98, '#f3f4fa', { top: '#ffffff' });
      monitor(p, x + 0.3, y + 0.2, 's', 0.98, 0.8);
      break;
    }
    case 'chair': {
      const cx = x + w / 2;
      const cy = y + h / 2;
      p.box(cx - 0.04, cy - 0.04, cx + 0.04, cy + 0.04, 0.02, 0.24, '#3a3f55', { lw: 0.5 });
      p.ellipse(cx, cy, 0.02, 0.22, 0.22, 'rgba(40,40,70,0.5)', null);
      p.box(x + 0.05, y + 0.05, x1 - 0.05, y1 - 0.05, 0.24, 0.32, '#2d3348', { top: '#454d6e' });
      if (v === 's') p.box(x + 0.05, y + 0.02, x1 - 0.05, y + 0.12, 0.32, 0.8, '#2d3348', { top: '#454d6e' });
      if (v === 'n') p.box(x + 0.05, y1 - 0.12, x1 - 0.05, y1 - 0.02, 0.32, 0.8, '#2d3348', { left: '#3d4566' });
      if (v === 'e') p.box(x + 0.02, y + 0.05, x + 0.12, y1 - 0.05, 0.32, 0.75, '#ff8a3d');
      if (v === 'w') p.box(x1 - 0.12, y + 0.05, x1 - 0.02, y1 - 0.05, 0.32, 0.75, '#ff8a3d');
      if (v === 'exec') p.box(x + 0.02, y + 0.02, x1 - 0.02, y + 0.15, 0.32, 1.05, '#4a2a1e', { top: '#6b4330' });
      break;
    }
    case 'plant':
    case 'bigPlant': {
      const cx = x + w / 2;
      const cy = y + h / 2;
      const big = f.kind === 'bigPlant';
      const potH = big ? 0.5 : 0.38;
      p.cylinder(cx, cy, w * 0.32, 0, potH, big ? '#f3f4fa' : '#e0784a');
      const leaves = big ? 9 : 6;
      const c = p.ctx;
      const [sx, sy] = p.P(cx, cy, potH);
      for (let i = 0; i < leaves; i++) {
        const ang = (i / leaves) * Math.PI * 2 + 0.4;
        const len = (big ? 30 : 18) * (0.8 + ((i * 13) % 5) / 10);
        const lx = sx + Math.cos(ang) * len * 0.55;
        const ly = sy - (big ? 26 : 14) - Math.sin(ang) * len * 0.3 - (i % 3) * 6;
        c.beginPath();
        c.ellipse(lx, ly, big ? 9 : 6, big ? 16 : 10, ang + Math.PI / 2, 0, Math.PI * 2);
        c.fillStyle = i % 2 ? PAL.leaf : PAL.leafDark;
        c.fill();
        c.strokeStyle = 'rgba(10,60,40,0.5)';
        c.lineWidth = 1;
        c.stroke();
        c.beginPath();
        c.moveTo(sx, sy - 4);
        c.lineTo(lx, ly);
        c.strokeStyle = 'rgba(20,90,60,0.6)';
        c.stroke();
      }
      break;
    }
    case 'couch': {
      const col = v.startsWith('mint') ? '#3ddc97' : v.startsWith('navy') ? '#34419a' : v.startsWith('blue') ? '#3d7bff' : v.startsWith('lilac') ? '#b39cff' : '#7a4a32';
      p.box(x, y, x1, y1, 0.05, 0.32, shade(col, -0.1));
      p.box(x + 0.06, y + 0.06, x1 - 0.06, y1 - 0.06, 0.32, 0.42, col, { top: shade(col, 0.2) });
      if (v.endsWith('-n')) p.box(x, y1 - 0.25, x1, y1, 0.32, 0.72, shade(col, -0.05));
      else if (v.endsWith('-e')) p.box(x, y, x + 0.25, y1, 0.32, 0.72, shade(col, -0.05));
      else p.box(x, y, x1, y + 0.25, 0.32, 0.72, shade(col, -0.05));
      // throw pillow
      p.box(x + w * 0.3, y + h * 0.3, x + w * 0.55, y + h * 0.55, 0.42, 0.55, PAL.yellow);
      break;
    }
    case 'beanbag': {
      const col = v === 'orange' ? PAL.orange : v === 'purple' ? PAL.purple : v === 'pink' ? '#ff6fb5' : PAL.cyan;
      const [sx, sy] = p.P(x + w / 2, y + h / 2, 0);
      const c = p.ctx;
      const g = c.createRadialGradient(sx - 8, sy - 16, 3, sx, sy - 8, 30);
      g.addColorStop(0, shade(col, 0.35));
      g.addColorStop(1, shade(col, -0.25));
      c.beginPath();
      c.moveTo(sx - 26, sy);
      c.bezierCurveTo(sx - 30, sy - 22, sx - 8, sy - 30, sx + 4, sy - 24);
      c.bezierCurveTo(sx + 26, sy - 26, sx + 30, sy - 4, sx + 24, sy + 4);
      c.bezierCurveTo(sx + 10, sy + 14, sx - 16, sy + 12, sx - 26, sy);
      c.fillStyle = g;
      c.fill();
      c.strokeStyle = OUT;
      c.stroke();
      break;
    }
    case 'serverRack': {
      p.box(x, y, x1, y1, 0, z, '#232838', { top: '#3a4160', right: '#171b28' });
      screenFace(p, x, y1, z, w, z, (c, W, H) => {
        for (let i = 0; i < 9; i++) {
          c.fillStyle = i % 3 === 0 ? '#2f3650' : '#283048';
          c.fillRect(2, 3 + i * (H / 9.5), W - 4, H / 11);
          c.fillStyle = 'rgba(255,255,255,0.08)';
          c.fillRect(4, 3 + i * (H / 9.5) + 1, W * 0.5, 1);
        }
      });
      break;
    }
    case 'console': {
      const col = v === 'critA' || v === 'critB' ? '#4a2030' : v === 'outage' ? '#2b3a8f' : v === 'cctv' || v === 'doors' ? '#22304a' : '#283048';
      p.box(x, y, x1, y1, 0, z * 0.75, col, { top: shade(col, 0.15) });
      // sloped screen top
      const screenCol = v === 'critA' || v === 'critB' ? '#ff5662' : v === 'outage' ? '#ffd23f' : v === 'doors' ? '#ff8a3d' : '#2ee6f0';
      if (w < h) {
        p.poly([[x + 0.1, y + 0.1, z * 0.75], [x1 - 0.05, y + 0.1, z], [x1 - 0.05, y1 - 0.1, z], [x + 0.1, y1 - 0.1, z * 0.75]], '#1a1e2c');
        p.poly([[x + 0.18, y + 0.18, z * 0.77], [x1 - 0.12, y + 0.18, z * 0.98], [x1 - 0.12, y1 - 0.18, z * 0.98], [x + 0.18, y1 - 0.18, z * 0.77]], screenCol, null);
      } else {
        p.poly([[x + 0.1, y + 0.1, z], [x1 - 0.1, y + 0.1, z], [x1 - 0.1, y1 - 0.05, z * 0.75], [x + 0.1, y1 - 0.05, z * 0.75]], '#1a1e2c');
        p.poly([[x + 0.18, y + 0.18, z * 0.98], [x1 - 0.18, y + 0.18, z * 0.98], [x1 - 0.18, y1 - 0.12, z * 0.77], [x + 0.18, y1 - 0.12, z * 0.77]], screenCol, null);
      }
      // label stripe
      p.faceS(x, y1, z * 0.6, (c) => {
        c.fillStyle = screenCol;
        c.fillRect(2, 2, w * 32 - 4, 3);
        c.fillStyle = 'rgba(255,255,255,0.85)';
        c.font = 'bold 6px sans-serif';
        const label = { server: 'SRV-01', critA: 'CORE A', critB: 'CORE B', network: 'NET', outage: 'SYS', cctv: 'CCTV', doors: 'DOORS' }[v] ?? '';
        c.fillText(label, 3, 12);
      });
      break;
    }
    case 'coolingUnit': {
      p.box(x, y, x1, y1, 0, z, '#c9cfe0', { top: '#e6e9f5' });
      screenFace(p, x, y1, z, w, z, (c, W, H) => {
        c.strokeStyle = '#7d86a6';
        c.lineWidth = 1.2;
        c.beginPath();
        c.arc(W / 2, H / 2, Math.min(W, H) * 0.35, 0, Math.PI * 2);
        c.stroke();
        for (let i = 0; i < 4; i++) {
          c.beginPath();
          c.moveTo(W / 2, H / 2);
          c.lineTo(W / 2 + Math.cos(i * 1.57) * 9, H / 2 + Math.sin(i * 1.57) * 9);
          c.stroke();
        }
      });
      break;
    }
    case 'counter':
      p.box(x, y, x1, y1, 0, z, '#f3f4fa', { top: '#ffffff', left: '#e3e6f2' });
      p.box(x, y, x1, y1, z - 0.06, z, '#c3c8d8', { top: '#eef0f8' });
      if (v === 'fruit') {
        p.cylinder(x + w / 2, y + h / 2, 0.22, z, z + 0.1, '#e0784a');
        const c = p.ctx;
        const [sx, sy] = p.P(x + w / 2, y + h / 2, z + 0.12);
        for (const [dx, dy, col] of [[-5, -2, '#ef3e4a'], [4, -3, '#ffd23f'], [0, -6, '#3ddc97']] as const) {
          c.beginPath();
          c.arc(sx + dx, sy + dy, 4, 0, Math.PI * 2);
          c.fillStyle = col;
          c.fill();
          c.strokeStyle = OUT;
          c.stroke();
        }
      }
      break;
    case 'coffeeMachine':
      p.box(x, y, x1, y1, 0, 0.9, '#f3f4fa', { top: '#ffffff', left: '#e3e6f2' });
      p.box(x + 0.15, y + 0.08, x1 - 0.15, y + 0.6, 0.9, z + 0.3, '#3a3f55', { top: '#c3c8d8' });
      screenFace(p, x + 0.15, y + 0.6, z + 0.3, w - 0.3, 0.6, (c, W) => {
        c.fillStyle = '#c3c8d8';
        c.fillRect(2, 2, W - 4, 4);
        c.fillStyle = '#ff8a3d';
        c.beginPath();
        c.arc(W - 6, 9, 1.6, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#3ddc97';
        c.beginPath();
        c.arc(W - 11, 9, 1.6, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#1a1e2c';
        c.fillRect(W / 2 - 5, 12, 10, 4);
      });
      p.cylinder(x + w / 2, y + 0.7, 0.07, 0.9, 1.02, '#ffffff');
      break;
    case 'fridge':
      p.box(x, y, x1, y1, 0, z, '#dfe3ee', { top: '#f3f5fb' });
      p.faceS(x, y1, z, (c) => {
        c.fillStyle = '#9aa3b8';
        c.fillRect(w * 32 - 6, 8, 2, 14);
        c.fillRect(w * 32 - 6, 30, 2, 14);
        c.fillStyle = 'rgba(0,0,0,0.12)';
        c.fillRect(0, 25, w * 32, 1.5);
        c.fillStyle = '#ffd23f';
        c.fillRect(6, 34, 8, 8);
        c.fillStyle = '#ff6fb5';
        c.fillRect(16, 38, 7, 7);
      });
      break;
    case 'vending': {
      const col = v === 'snack' ? '#ef3e4a' : v === 'drink' ? '#3d7bff' : '#8a5cf6';
      p.box(x, y, x1, y1, 0, z, col);
      p.faceS(x, y1, z, (c) => {
        const W = w * 32;
        const H = z * 32;
        c.fillStyle = 'rgba(200,235,255,0.85)';
        c.fillRect(3, 4, W * 0.68, H * 0.7);
        const items = ['#ffd23f', '#3ddc97', '#ff8a3d', '#ffffff', '#ff6fb5'];
        for (let r = 0; r < 4; r++)
          for (let k = 0; k < 4; k++) {
            c.fillStyle = items[(r + k) % items.length];
            c.fillRect(5 + k * (W * 0.16), 7 + r * (H * 0.16), W * 0.1, H * 0.1);
          }
        c.fillStyle = '#1a1e2c';
        c.fillRect(W * 0.76, 8, W * 0.16, H * 0.3);
        c.fillRect(6, H * 0.8, W * 0.6, H * 0.1);
      });
      break;
    }
    case 'cafeTable': {
      const cx = x + w / 2;
      const cy = y + h / 2;
      p.cylinder(cx, cy, 0.06, 0, 0.5, PAL.metal);
      p.cylinder(cx, cy, 0.55, 0.5, 0.56, '#ffffff');
      p.cylinder(cx + 0.15, cy - 0.1, 0.07, 0.56, 0.66, '#ff8a3d');
      break;
    }
    case 'confTable':
      p.box(x + 0.6, y + 0.6, x1 - 0.6, y1 - 0.6, 0, 0.48, '#3a3f55');
      p.box(x, y, x1, y1, 0.48, 0.56, PAL.walnut, { top: '#7d5038', stroke: v === 'm' ? OUT : OUT });
      if (v !== 'm') {
        // laptops + notebooks
        p.box(x + 0.5, y + 0.3, x + 1.0, y + 0.65, 0.56, 0.58, '#c3c8d8', { lw: 0.5 });
        p.box(x + 1.1, y1 - 0.6, x + 1.5, y1 - 0.3, 0.56, 0.575, '#ffffff', { lw: 0.5 });
      }
      break;
    case 'bigScreen':
      p.box(x, y, x1, y1, 0.55, z, '#151a2a');
      screenFace(p, x, y1, z, w, z - 0.55, (c, W, H) => {
        const g = c.createLinearGradient(0, 0, W, H);
        g.addColorStop(0, '#1b2a6b');
        g.addColorStop(1, '#3d2a8f');
        c.fillStyle = g;
        c.fillRect(2, 2, W - 4, H - 4);
        c.fillStyle = '#ffd23f';
        c.font = 'bold 8px Fredoka, sans-serif';
        c.fillText('Q3 SYNERGY', 6, 12);
        c.strokeStyle = '#3ddc97';
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(8, H - 6);
        c.lineTo(W * 0.3, H - 12);
        c.lineTo(W * 0.5, H - 9);
        c.lineTo(W * 0.75, H - 20);
        c.lineTo(W - 8, H - 26);
        c.stroke();
        c.fillStyle = '#3ddc97';
        c.fillText('▲ 4000%', W - 46, 12);
      });
      break;
    case 'whiteboard':
      p.box(x + 0.1, y, x + 0.16, y1, 0, z - 0.2, PAL.metal, { lw: 0.5 });
      p.box(x1 - 0.16, y, x1 - 0.1, y1, 0, z - 0.2, PAL.metal, { lw: 0.5 });
      p.box(x, y, x1, y1, 0.55, z, '#ffffff', { top: '#c3c8d8' });
      screenFace(p, x, y1, z, w, z - 0.55, (c, W, H) => {
        c.lineWidth = 1.4;
        c.font = 'bold 7px Fredoka, sans-serif';
        if (v === 'okr') {
          c.fillStyle = '#3d7bff';
          c.fillText('OKRs: ???', 4, 9);
          c.strokeStyle = '#ef3e4a';
          c.beginPath();
          c.moveTo(6, H - 4);
          c.lineTo(W * 0.4, 14);
          c.lineTo(W * 0.6, H - 6);
          c.lineTo(W - 6, 10);
          c.stroke();
        } else {
          c.fillStyle = '#8a5cf6';
          c.fillText('MANDATORY FUN', 4, 9);
          c.fillStyle = '#ef3e4a';
          c.fillText('FRI 4:59PM', 4, 18);
          c.strokeStyle = '#3ddc97';
          c.beginPath();
          c.arc(W - 12, H / 2 + 2, 6, 0.2, Math.PI - 0.2);
          c.stroke();
        }
      });
      break;
    case 'cabinet':
      p.box(x, y, x1, y1, 0, z, '#aab2c8', { top: '#c9cfe0' });
      p.faceS(x, y1, z, (c) => {
        const W = w * 32;
        const H = z * 32;
        for (let i = 0; i < 3; i++) {
          c.strokeStyle = 'rgba(30,30,60,0.35)';
          c.lineWidth = 1;
          c.strokeRect(2, 2 + i * (H / 3), W - 4, H / 3 - 3);
          c.fillStyle = '#5f6782';
          c.fillRect(W / 2 - 4, 6 + i * (H / 3), 8, 2);
          c.fillStyle = '#ffffff';
          c.fillRect(W / 2 - 3, 10 + i * (H / 3), 6, 3);
        }
      });
      break;
    case 'shelf':
    case 'bookshelf':
    case 'partsShelf': {
      const frame = f.kind === 'bookshelf' ? PAL.walnut : '#7d86a6';
      p.box(x, y, x1, y1, 0, z, frame, { top: shade(frame, 0.2) });
      const alongX = w >= h;
      const draw = (c: CanvasRenderingContext2D, W: number, H: number) => {
        c.fillStyle = 'rgba(0,0,0,0.35)';
        c.fillRect(2, 2, W - 4, H - 4);
        const rows = 4;
        const colors = f.kind === 'bookshelf' ? ['#ef3e4a', '#3d7bff', '#ffd23f', '#3ddc97', '#8a5cf6', '#ff8a3d'] : f.kind === 'partsShelf' ? ['#2ee6f0', '#3a3f55', '#3ddc97', '#c3c8d8'] : ['#c8a06a', '#e0c08a', '#ffffff', '#3d7bff'];
        for (let r = 0; r < rows; r++) {
          const ry = 3 + r * ((H - 4) / rows);
          c.fillStyle = shade(frame, 0.1);
          c.fillRect(2, ry + (H - 4) / rows - 2, W - 4, 2);
          let bx = 4;
          let k = r * 3;
          while (bx < W - 6) {
            const bw = f.kind === 'bookshelf' ? 3 + (k % 3) : 6 + (k % 4);
            const bh = ((H - 4) / rows) * (0.55 + (k % 4) * 0.1);
            c.fillStyle = colors[k % colors.length];
            c.fillRect(bx, ry + (H - 4) / rows - 2 - bh, bw, bh);
            bx += bw + 1;
            k++;
          }
        }
      };
      if (alongX) p.faceS(x, y1, z, (c) => draw(c, w * 32, z * 32));
      else p.faceE(x1, y1, z, (c) => draw(c, h * 32, z * 32));
      break;
    }
    case 'boxes': {
      if (v === 'paper') {
        p.box(x, y, x1, y1, 0, z * 0.5, '#ffffff', { top: '#ffffff' });
        p.box(x + 0.1, y + 0.1, x1 - 0.1, y1 - 0.1, z * 0.5, z, '#f3f0e6');
        p.top(x + 0.2, y + 0.2, z + 0.001, (c) => {
          c.fillStyle = '#3d7bff';
          c.fillRect(4, 4, 14, 6);
        });
      } else {
        p.box(x, y, x1, y1, 0, z * 0.55, '#c8975e', { top: '#dcb07a' });
        p.box(x + 0.15, y + 0.1, x1 - 0.1, y1 - 0.2, z * 0.55, z, '#b9874f', { top: '#d3a46c' });
        p.top(x + 0.15, y + 0.1, z + 0.001, (c) => {
          c.fillStyle = 'rgba(255,255,255,0.4)';
          c.fillRect(0, 10, (w - 0.25) * 32, 3);
        });
      }
      break;
    }
    case 'printer':
      p.box(x, y, x1, y1, 0, 0.7, '#e6e9f5', { top: '#f6f7fb' });
      p.box(x + 0.1, y + 0.1, x1 - 0.1, y1 - 0.25, 0.7, z, '#d3d8e8', { top: '#eef0f8' });
      p.box(x + 0.25, y1 - 0.25, x1 - 0.25, y1 + 0.02, 0.45, 0.5, '#ffffff');
      p.faceS(x, y1, 0.7, (c) => {
        const W = w * 32;
        c.fillStyle = '#2b3a8f';
        c.fillRect(W - 18, 3, 14, 7);
        c.fillStyle = '#3ddc97';
        c.fillRect(W - 16, 5, 4, 3);
        c.fillStyle = 'rgba(0,0,0,0.15)';
        c.fillRect(4, 12, W - 8, 1.5);
        c.fillRect(4, 18, W - 8, 1.5);
      });
      break;
    case 'execDesk':
      p.box(x, y, x + 0.2, y1, 0, 0.55, PAL.walnut);
      p.box(x1 - 0.2, y, x1, y1, 0, 0.55, PAL.walnut);
      p.box(x, y, x1, y1, 0.55, 0.62, '#5a3424', { top: '#7d5038' });
      p.box(x + 0.15, y1 - 0.15, x1 - 0.15, y1 - 0.08, 0.1, 0.55, '#5a3424');
      p.faceS(x, y1 - 0.08, 0.5, (c) => {
        c.fillStyle = '#ffd23f';
        c.fillRect(4, 2, w * 32 - 8, 1.2);
      });
      // laptop + nameplate + gold pen
      p.box(x + 0.5, y + 0.25, x + 1.05, y + 0.65, 0.62, 0.64, '#c3c8d8', { lw: 0.5 });
      p.poly([[x + 0.5, y + 0.25, 0.64], [x + 1.05, y + 0.25, 0.64], [x + 1.05, y + 0.25, 0.95], [x + 0.5, y + 0.25, 0.95]], '#2b2f3f');
      p.box(x + 0.3, y1 - 0.3, x + 0.7, y1 - 0.2, 0.62, 0.7, '#ffd23f');
      break;
    case 'trophy':
      p.box(x, y, x1, y1, 0, 0.75, '#2b2f3f', { top: '#3a3f55' });
      p.cylinder(x + w / 2, y + h / 2, 0.12, 0.75, 0.85, '#ffd23f');
      p.cylinder(x + w / 2, y + h / 2, 0.05, 0.85, 1.0, '#ffd23f');
      p.cylinder(x + w / 2, y + h / 2, 0.18, 1.0, 1.25, '#ffd23f');
      break;
    case 'aquarium':
      p.box(x, y, x1, y1, 0, 0.6, '#2b2f3f', { top: '#3a3f55' });
      p.box(x + 0.05, y + 0.05, x1 - 0.05, y1 - 0.05, 0.6, z, 'rgba(46,170,240,0.55)', { top: 'rgba(150,230,255,0.6)', stroke: 'rgba(230,250,255,0.8)' });
      p.faceS(x + 0.05, y1 - 0.05, z, (c) => {
        const W = (w - 0.1) * 32;
        for (const [fx, fy, col] of [[W * 0.2, 6, '#ff8a3d'], [W * 0.55, 11, '#ffd23f'], [W * 0.8, 5, '#ff6fb5']] as const) {
          c.fillStyle = col;
          c.beginPath();
          c.ellipse(fx, fy, 3, 1.8, 0, 0, Math.PI * 2);
          c.fill();
          c.beginPath();
          c.moveTo(fx - 3, fy);
          c.lineTo(fx - 6, fy - 2);
          c.lineTo(fx - 6, fy + 2);
          c.fill();
        }
        c.fillStyle = '#3ddc97';
        c.fillRect(4, 12, 2, 6);
        c.fillRect(W - 10, 10, 2, 8);
      });
      break;
    case 'receptionDesk':
      p.box(x, y, x1, y1, 0, z, '#f3f4fa', { top: '#ffffff', left: '#e8eafb' });
      p.box(x, y, x1, y1, z - 0.05, z + 0.03, '#2b3a8f', { top: '#3d4fb8' });
      p.faceS(x, y1, z - 0.06, (c) => {
        const W = w * 32;
        c.fillStyle = v === 'm' ? '#3d7bff' : '#8a5cf6';
        c.fillRect(0, 6, W, 3);
        if (v === 'm') {
          c.fillStyle = '#2b3a8f';
          c.font = 'bold 8px Fredoka, sans-serif';
          c.textAlign = 'center';
          c.fillText('WELCOME', W / 2, 19);
        }
      });
      if (v === 'm') monitor(p, x + 0.4, y + 0.3, 'n', z, 0.6);
      break;
    case 'scanner':
      p.box(x + 0.25, y + 0.25, x1 - 0.25, y1 - 0.25, 0, 0.8, '#3a3f55');
      p.box(x + 0.1, y + 0.1, x1 - 0.1, y1 - 0.1, 0.8, z, '#252a3d', { top: '#1a1e2c' });
      p.top(x + 0.15, y + 0.15, z + 0.001, (c) => {
        c.fillStyle = '#2ee6f0';
        c.fillRect(2, 2, (w - 0.3) * 32 - 4, (h - 0.3) * 32 - 4);
        c.fillStyle = 'rgba(255,255,255,0.6)';
        c.fillRect(4, ((h - 0.3) * 32) / 2, (w - 0.3) * 32 - 8, 1.2);
      });
      break;
    case 'turnstile':
      p.box(x, y, x1, y + 0.2, 0, z, '#c3c8d8');
      p.box(x, y1 - 0.2, x1, y1, 0, z, '#c3c8d8');
      p.box(x + 0.05, y + 0.2, x + 0.1, y1 - 0.2, 0.3, z, 'rgba(170,215,255,0.4)', { stroke: 'rgba(255,255,255,0.6)' });
      break;
    case 'monitorWall':
      p.box(x, y, x1, y1, 0.35, z, '#151a2a');
      screenFace(p, x, y1, z, w, z - 0.35, (c, W, H) => {
        for (let r = 0; r < 2; r++)
          for (let k = 0; k < 3; k++) {
            const sx = 3 + k * ((W - 6) / 3);
            const sy = 3 + r * ((H - 6) / 2);
            c.fillStyle = '#123044';
            c.fillRect(sx, sy, (W - 6) / 3 - 2, (H - 6) / 2 - 2);
            c.fillStyle = 'rgba(46,230,240,0.55)';
            c.fillRect(sx + 2, sy + (H - 6) / 2 - 7, ((W - 6) / 3 - 6) * 0.6, 1);
            c.fillStyle = '#ef3e4a';
            c.fillRect(sx + 3, sy + 3, 2, 2);
          }
      });
      break;
    case 'tv':
      p.box(x + 0.2, y, x1 - 0.2, y1, 0, 0.35, '#2b2f3f', { top: '#3a3f55' });
      p.box(x, y, x1, y + 0.12, 0.45, z, '#151a2a');
      screenFace(p, x, y + 0.12, z, w, z - 0.45, (c, W, H) => {
        const g = c.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#ff6fb5');
        g.addColorStop(1, '#8a5cf6');
        c.fillStyle = g;
        c.fillRect(2, 2, W - 4, H - 4);
        c.fillStyle = '#ffd23f';
        c.fillRect(W * 0.3, H * 0.55, 6, 6);
        c.fillStyle = '#2ee6f0';
        c.fillRect(W * 0.6, H * 0.4, 6, 6);
        c.fillStyle = '#ffffff';
        c.font = 'bold 6px monospace';
        c.fillText('P1 WINS', 4, 9);
      });
      break;
    case 'arcade':
      p.box(x, y, x1, y1, 0, z, '#8a5cf6', { top: '#ff6fb5' });
      p.faceS(x, y1, z, (c) => {
        const W = w * 32;
        c.fillStyle = '#151a2a';
        c.fillRect(3, 8, W - 6, 16);
        c.fillStyle = '#2ee6f0';
        c.fillRect(5, 10, W - 10, 12);
        c.fillStyle = '#ffd23f';
        c.fillRect(W / 2 - 3, 14, 6, 4);
        c.fillStyle = '#ef3e4a';
        c.beginPath();
        c.arc(W / 2 - 4, 30, 2, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#3ddc97';
        c.beginPath();
        c.arc(W / 2 + 4, 30, 2, 0, Math.PI * 2);
        c.fill();
      });
      break;
    case 'pingpong':
      legs(p, x, y, x1, y1, 0.5, '#2b2f3f');
      p.box(x, y, x1, y1, 0.5, 0.56, '#1f8f63', { top: '#2bb37b' });
      p.top(x, y, 0.561, (c) => {
        c.strokeStyle = '#ffffff';
        c.lineWidth = 1.5;
        c.strokeRect(1, 1, w * 32 - 2, h * 32 - 2);
        c.beginPath();
        c.moveTo(0, (h * 32) / 2);
        c.lineTo(w * 32, (h * 32) / 2);
        c.stroke();
      });
      if (v === 'e') p.box(x, y, x + 0.04, y1, 0.56, 0.7, '#ffffff', { stroke: 'rgba(0,0,0,0.3)' });
      break;
    case 'neonSign':
      p.box(x, y, x1, y1, 0.6, z, '#1a1e2c');
      p.faceS(x, y1, z, (c) => {
        c.shadowColor = '#ff6fb5';
        c.shadowBlur = 6;
        c.fillStyle = '#ff9ad0';
        c.font = 'bold 15px Fredoka, sans-serif';
        c.textAlign = 'center';
        c.fillText('PLAY HARD', (w * 32) / 2, 17);
      });
      break;
    case 'electricPanel':
      p.box(x, y, x1, y1, 0.2, z, '#9aa3b8', { top: '#c3c8d8' });
      p.faceS(x, y1, z, (c) => {
        const W = w * 32;
        c.fillStyle = '#ffd23f';
        c.beginPath();
        c.moveTo(W - 10, 4);
        c.lineTo(W - 4, 14);
        c.lineTo(W - 16, 14);
        c.closePath();
        c.fill();
        c.fillStyle = '#1a1e2c';
        c.font = 'bold 8px sans-serif';
        c.fillText('!', W - 11.5, 13);
        for (let i = 0; i < 5; i++) {
          c.fillStyle = '#2b2f3f';
          c.fillRect(4 + i * 7, 18, 5, 12);
          c.fillStyle = '#3ddc97';
          c.fillRect(5 + i * 7, 19, 3, 4);
        }
      });
      break;
    case 'boiler': {
      const small = v === 'small';
      p.cylinder(x + w / 2, y + h / 2, w * 0.42, 0, z, small ? '#c85a26' : '#9aa3b8');
      p.cylinder(x + w / 2 + 0.25, y + h / 2 + 0.25, 0.08, z * 0.5, z * 0.65, '#ffffff');
      break;
    }
    case 'pipes':
      for (let i = 0; i < 3; i++) p.cylinder(x + w / 2, y + 0.4 + i * 0.8, 0.12, 0, z, ['#ef3e4a', '#3d7bff', '#ffd23f'][i]);
      break;
    case 'waterCooler':
      p.box(x + 0.1, y + 0.1, x1 - 0.1, y1 - 0.1, 0, 0.8, '#f3f4fa');
      p.cylinder(x + w / 2, y + h / 2, w * 0.3, 0.8, z, 'rgba(90,170,255,0.75)');
      break;
    case 'networkRack':
      p.box(x, y, x1, y1, 0, z, '#232838', { top: '#3a4160' });
      p.faceS(x, y1, z, (c) => {
        const W = w * 32;
        for (let i = 0; i < 5; i++) {
          c.fillStyle = '#2f3650';
          c.fillRect(2, 4 + i * 8, W - 4, 6);
          for (let k = 0; k < 8; k++) {
            c.fillStyle = ['#ffd23f', '#3ddc97', '#3d7bff', '#ef3e4a'][(i + k) % 4];
            c.fillRect(4 + k * ((W - 8) / 8), 6 + i * 8, 2, 2);
          }
        }
      });
      break;
    case 'alarmPanel':
      p.box(x + 0.1, y + 0.1, x1 - 0.1, y1 - 0.1, 0, 0.7, '#3a3f55');
      p.box(x, y, x1, y1, 0.7, z, '#ef3e4a', { top: '#ff6f78' });
      p.faceS(x, y1, z, (c) => {
        c.fillStyle = '#ffffff';
        c.font = 'bold 6px sans-serif';
        c.fillText('FIRE', 2, 8);
        c.fillStyle = '#ffd23f';
        c.fillRect(3, 10, w * 32 - 6, 4);
      });
      break;
    case 'logoWall':
      p.box(x, y, x1, y1, 0.3, z, '#151a2a');
      p.faceS(x, y1, z, (c) => {
        const W = w * 32;
        c.shadowColor = '#2ee6f0';
        c.shadowBlur = 8;
        c.fillStyle = '#9ff7ff';
        c.font = 'bold 18px Fredoka, sans-serif';
        c.textAlign = 'center';
        c.fillText('NEXUS HQ', W / 2, 21);
        c.shadowBlur = 0;
        c.fillStyle = 'rgba(255,210,63,0.9)';
        c.font = '600 6px Inter, sans-serif';
        c.fillText('DISRUPTING DISRUPTION SINCE 2019', W / 2, 30);
      });
      break;
    default:
      p.box(x, y, x1, y1, 0, z, '#9aa3b8');
  }
}

/** Small reusable effect textures (LEDs, glows, particles, markers). */
export function makeFxTextures(): Record<string, HTMLCanvasElement> {
  const mk = (w: number, h: number, fn: (c: CanvasRenderingContext2D) => void) => {
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const c = cv.getContext('2d')!;
    fn(c);
    return cv;
  };
  const radial = (size: number, inner: string, outer: string) =>
    mk(size, size, (c) => {
      const g = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      g.addColorStop(0, inner);
      g.addColorStop(1, outer);
      c.fillStyle = g;
      c.fillRect(0, 0, size, size);
    });
  return {
    glow: radial(64, 'rgba(255,255,255,0.9)', 'rgba(255,255,255,0)'),
    led: mk(4, 3, (c) => {
      c.fillStyle = '#ffffff';
      c.fillRect(0, 0, 4, 3);
    }),
    steam: radial(16, 'rgba(255,255,255,0.8)', 'rgba(255,255,255,0)'),
    shadow: mk(48, 20, (c) => {
      const g = c.createRadialGradient(24, 10, 2, 24, 10, 24);
      g.addColorStop(0, 'rgba(10,10,40,0.45)');
      g.addColorStop(1, 'rgba(10,10,40,0)');
      c.fillStyle = g;
      c.scale(1, 0.42);
      c.beginPath();
      c.arc(24, 24, 24, 0, Math.PI * 2);
      c.fill();
    }),
    ring: mk(96, 48, (c) => {
      c.strokeStyle = 'rgba(255,210,63,0.95)';
      c.lineWidth = 3;
      c.beginPath();
      c.ellipse(48, 24, 44, 20, 0, 0, Math.PI * 2);
      c.stroke();
    }),
    chevron: mk(28, 24, (c) => {
      c.fillStyle = '#ffd23f';
      c.strokeStyle = '#3a2a00';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(2, 2);
      c.lineTo(14, 12);
      c.lineTo(26, 2);
      c.lineTo(26, 10);
      c.lineTo(14, 22);
      c.lineTo(2, 10);
      c.closePath();
      c.fill();
      c.stroke();
    }),
    paper: mk(14, 18, (c) => {
      c.fillStyle = '#ffffff';
      c.fillRect(0, 0, 14, 18);
      c.fillStyle = '#9aa3b8';
      for (let i = 0; i < 4; i++) c.fillRect(2, 3 + i * 4, 10 - (i % 2) * 3, 1.3);
      c.strokeStyle = 'rgba(0,0,0,0.3)';
      c.strokeRect(0.5, 0.5, 13, 17);
    }),
    confetti: mk(6, 4, (c) => {
      c.fillStyle = '#ffffff';
      c.fillRect(0, 0, 6, 4);
    }),
    spark: radial(24, 'rgba(255,240,180,1)', 'rgba(255,210,63,0)'),
    beacon: mk(60, 60, (c) => {
      const g = c.createRadialGradient(30, 30, 0, 30, 30, 30);
      g.addColorStop(0, 'rgba(255,60,70,0.8)');
      g.addColorStop(1, 'rgba(255,60,70,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, 60, 60);
    }),
    emergency: mk(40, 34, (c) => {
      c.fillStyle = '#2b2f3f';
      c.beginPath();
      c.ellipse(20, 24, 17, 8, 0, 0, Math.PI * 2);
      c.fill();
      const g = c.createRadialGradient(15, 12, 2, 20, 18, 16);
      g.addColorStop(0, '#ff9aa0');
      g.addColorStop(1, '#c8202d');
      c.fillStyle = g;
      c.beginPath();
      c.ellipse(20, 20, 13, 6, 0, 0, Math.PI);
      c.ellipse(20, 14, 13, 10, 0, Math.PI, 0);
      c.fill();
      c.strokeStyle = 'rgba(30,10,20,0.7)';
      c.lineWidth = 1.2;
      c.stroke();
    }),
    lockBar: mk(70, 60, (c) => {
      c.fillStyle = 'rgba(239,62,74,0.35)';
      c.fillRect(0, 0, 70, 60);
      c.fillStyle = '#ffd23f';
      for (let i = -2; i < 10; i++) {
        c.save();
        c.translate(i * 12, 0);
        c.transform(1, 0, -0.6, 1, 0, 0);
        c.fillRect(0, 0, 6, 60);
        c.restore();
      }
    }),
  };
}
