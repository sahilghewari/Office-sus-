import { describe, expect, it } from 'vitest';
import {
  FURNITURE,
  LOBBY_SPAWNS,
  MEETING_SPAWNS,
  PLAYER_RADIUS,
  ROOMS,
  STATIONS,
  VENTS,
  collides,
  createColliders,
  findPath,
  lineOfSight,
  roomAt,
  stepMovement,
  screenToWorldDir,
} from '@corp/shared';

const cols = createColliders();

describe('NEXUS HQ map', () => {
  it('has all 12 required areas', () => {
    const ids = ROOMS.map((r) => r.id);
    for (const r of ['reception', 'workspace', 'conference', 'hr', 'ceo', 'cafeteria', 'gaming', 'server', 'it', 'printer', 'security', 'hallN', 'hallS', 'maintenance'])
      expect(ids).toContain(r);
  });

  it('every interaction point / vent / spawn is on free floor', () => {
    const pts: [string, number, number][] = [
      ...STATIONS.filter((s) => s.kind !== 'emergency').map((s) => [s.id, s.x, s.y] as [string, number, number]),
      ...VENTS.map((v) => [v.id, v.x, v.y] as [string, number, number]),
      ...MEETING_SPAWNS.map((p, i) => [`ms${i}`, p[0], p[1]] as [string, number, number]),
      ...LOBBY_SPAWNS.map((p, i) => [`ls${i}`, p[0], p[1]] as [string, number, number]),
    ];
    for (const [id, x, y] of pts) expect(collides(cols, x, y, PLAYER_RADIUS), id).toBe(false);
  });

  it('stations are inside their declared rooms', () => {
    for (const s of STATIONS) expect(roomAt(s.x, s.y), s.id).toBe(s.room);
    for (const v of VENTS) expect(roomAt(v.x, v.y), v.id).toBe(v.room);
  });

  it('every station and vent is reachable from the conference room', () => {
    const [sx, sy] = MEETING_SPAWNS[0];
    for (const s of [...STATIONS.filter((s) => s.kind !== 'emergency'), ...VENTS]) {
      const p = findPath(sx, sy, s.x, s.y, cols);
      expect(p, `path to ${s.id}`).not.toBeNull();
    }
  });

  it('furniture stays inside the map', () => {
    for (const f of FURNITURE) {
      expect(f.x).toBeGreaterThan(0.9);
      expect(f.y).toBeGreaterThan(0.9);
      expect(f.x + f.w).toBeLessThan(49.1);
      expect(f.y + f.h).toBeLessThan(39.1);
    }
  });
});

describe('movement', () => {
  it('cannot walk through a wall', () => {
    // Server room north wall is at y≈0.5; walk up for 5 seconds
    let s = { x: 5, y: 3.5, vx: 0, vy: 0 };
    for (let i = 0; i < 100; i++) s = stepMovement(s, 0, -1, 3.4, 0.05, cols);
    expect(s.y).toBeGreaterThan(2.1); // blocked by the server console
    // Hallway → wall between hall and workspace (y=13) away from doors
    s = { x: 13, y: 12, vx: 0, vy: 0 };
    for (let i = 0; i < 100; i++) s = stepMovement(s, 0, 1, 3.4, 0.05, cols);
    expect(s.y).toBeLessThan(13.1);
  });
  it('passes through doorways', () => {
    let s = { x: 6.5, y: 12, vx: 0, vy: 0 };
    for (let i = 0; i < 40; i++) s = stepMovement(s, 0, 1, 3.4, 0.05, cols);
    expect(s.y).toBeGreaterThan(14.5);
  });
  it('never exceeds speed even with oversized input', () => {
    let s = { x: 20, y: 11.5, vx: 0, vy: 0 };
    for (let i = 0; i < 40; i++) {
      const n = stepMovement(s, 50, 0, 3.4, 0.05, cols);
      expect(Math.hypot(n.x - s.x, n.y - s.y)).toBeLessThanOrEqual(3.4 * 0.05 + 1e-9);
      s = n;
    }
  });
  it('accelerates and stops smoothly', () => {
    let s = { x: 12, y: 12.25, vx: 0, vy: 0 };
    s = stepMovement(s, 1, 0, 3.4, 0.05, cols);
    expect(s.vx).toBeGreaterThan(0);
    expect(s.vx).toBeLessThan(3.4);
    for (let i = 0; i < 20; i++) s = stepMovement(s, 1, 0, 3.4, 0.05, cols);
    expect(s.vx).toBeCloseTo(3.4, 1);
    for (let i = 0; i < 20; i++) s = stepMovement(s, 0, 0, 3.4, 0.05, cols);
    expect(s.vx).toBe(0);
  });
  it('NaN input is ignored', () => {
    const s = stepMovement({ x: 20, y: 11.5, vx: 0, vy: 0 }, NaN, Infinity, 3.4, 0.05, cols);
    expect(Number.isFinite(s.x)).toBe(true);
  });
  it('screen-up moves up the screen in iso space', () => {
    const [wx, wy] = screenToWorldDir(0, -1);
    expect(wx).toBeLessThan(0);
    expect(wy).toBeLessThan(0);
  });
});

describe('line of sight', () => {
  it('walls block, glass does not', () => {
    expect(lineOfSight(5, 5, 15, 5)).toBe(false); // server ↔ IT through wall
    expect(lineOfSight(30, 12, 30, 16)).toBe(true); // hallway → conference through glass
    expect(lineOfSight(20, 11.5, 30, 11.5)).toBe(true);
  });
});
