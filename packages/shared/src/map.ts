/**
 * NEXUS HQ — the one (very well-funded) office map.
 *
 * The map is defined in logical world units where one unit = one floor tile.
 * World axes: +x runs toward the bottom-right of the screen, +y toward the
 * bottom-left (standard 2:1 isometric projection, done by the client).
 *
 * Walls are generated from room rectangles; every wall tile becomes one or two
 * thin axis-aligned boxes so walls read as thin partitions instead of blocks.
 * The SAME collider list is used by the server simulation and by client-side
 * prediction, so movement never disagrees between the two.
 */

export const MAP_W = 50;
export const MAP_H = 40;

export type RoomId =
  | 'server'
  | 'it'
  | 'ceo'
  | 'hr'
  | 'security'
  | 'workspace'
  | 'conference'
  | 'gaming'
  | 'printer'
  | 'reception'
  | 'cafeteria'
  | 'maintenance'
  | 'hallN'
  | 'hallS';

export type FloorStyle = 'concrete' | 'carpetBlue' | 'marble' | 'carpetPurple' | 'carpetDark' | 'wood' | 'carpetConf' | 'carpetNeon' | 'tile' | 'checker' | 'hazard' | 'hall';

export interface RoomDef {
  id: RoomId;
  name: string;
  /** inclusive tile rect */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  floor: FloorStyle;
  /** Hallways count as "maintenance areas" in the spec. */
  isHall?: boolean;
}

export const ROOMS: RoomDef[] = [
  { id: 'server', name: 'Server Room', x0: 1, y0: 1, x1: 9, y1: 9, floor: 'concrete' },
  { id: 'it', name: 'IT Support', x0: 11, y0: 1, x1: 19, y1: 9, floor: 'carpetBlue' },
  { id: 'ceo', name: 'CEO Cabin', x0: 21, y0: 1, x1: 30, y1: 9, floor: 'marble' },
  { id: 'hr', name: 'HR Department', x0: 32, y0: 1, x1: 40, y1: 9, floor: 'carpetPurple' },
  { id: 'security', name: 'Security Office', x0: 42, y0: 1, x1: 48, y1: 9, floor: 'carpetDark' },
  { id: 'hallN', name: 'North Hallway', x0: 1, y0: 11, x1: 48, y1: 12, floor: 'hall', isHall: true },
  { id: 'workspace', name: 'Open Workspace', x0: 1, y0: 14, x1: 24, y1: 24, floor: 'wood' },
  { id: 'conference', name: 'Conference Room', x0: 26, y0: 14, x1: 37, y1: 24, floor: 'carpetConf' },
  { id: 'gaming', name: 'Gaming Room', x0: 39, y0: 14, x1: 48, y1: 24, floor: 'carpetNeon' },
  { id: 'hallS', name: 'South Hallway', x0: 1, y0: 26, x1: 48, y1: 27, floor: 'hall', isHall: true },
  { id: 'printer', name: 'Printer & Storage', x0: 1, y0: 29, x1: 10, y1: 38, floor: 'tile' },
  { id: 'reception', name: 'Main Reception', x0: 12, y0: 29, x1: 25, y1: 38, floor: 'marble' },
  { id: 'cafeteria', name: 'Cafeteria', x0: 27, y0: 29, x1: 38, y1: 38, floor: 'checker' },
  { id: 'maintenance', name: 'Maintenance & Electrical', x0: 40, y0: 29, x1: 48, y1: 38, floor: 'hazard' },
];

export const ROOM_BY_ID: Record<RoomId, RoomDef> = Object.fromEntries(ROOMS.map((r) => [r.id, r])) as Record<
  RoomId,
  RoomDef
>;

export interface DoorDef {
  id: string;
  /** door tiles (wall tiles turned into openings) */
  tiles: [number, number][];
  /** Lockable by the "Lock Conference Rooms" sabotage. */
  lockable?: boolean;
  /** 'h' = opening in a wall running along x; 'v' = wall running along y */
  orient: 'h' | 'v';
}

export const DOORS: DoorDef[] = [
  { id: 'd-server', tiles: [[4, 10], [5, 10]], orient: 'h' },
  { id: 'd-it', tiles: [[15, 10], [16, 10]], orient: 'h' },
  { id: 'd-ceo', tiles: [[25, 10], [26, 10]], orient: 'h' },
  { id: 'd-hr', tiles: [[36, 10], [37, 10]], orient: 'h' },
  { id: 'd-sec', tiles: [[45, 10], [46, 10]], orient: 'h' },
  { id: 'd-ws-n1', tiles: [[6, 13], [7, 13]], orient: 'h' },
  { id: 'd-ws-n2', tiles: [[18, 13], [19, 13]], orient: 'h' },
  { id: 'd-conf-n', tiles: [[31, 13], [32, 13]], orient: 'h', lockable: true },
  { id: 'd-game-n', tiles: [[43, 13], [44, 13]], orient: 'h' },
  { id: 'd-conf-w', tiles: [[25, 19], [25, 20]], orient: 'v', lockable: true },
  { id: 'd-ws-s', tiles: [[10, 25], [11, 25]], orient: 'h' },
  { id: 'd-conf-s', tiles: [[31, 25], [32, 25]], orient: 'h', lockable: true },
  { id: 'd-game-s', tiles: [[43, 25], [44, 25]], orient: 'h' },
  { id: 'd-print', tiles: [[5, 28], [6, 28]], orient: 'h' },
  { id: 'd-recep', tiles: [[18, 28], [19, 28]], orient: 'h' },
  { id: 'd-cafe', tiles: [[32, 28], [33, 28]], orient: 'h' },
  { id: 'd-maint', tiles: [[44, 28], [45, 28]], orient: 'h' },
  { id: 'd-recep-cafe', tiles: [[26, 33], [26, 34]], orient: 'v' },
];

/** Tile kinds in the generated grid. */
export enum Tile {
  Void = 0,
  Floor = 1,
  Wall = 2,
  Glass = 3,
  Door = 4,
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface WallPiece extends Box {
  tx: number;
  ty: number;
  glass: boolean;
}

// ---------------------------------------------------------------------------
// Furniture
// ---------------------------------------------------------------------------

export type FurnitureKind =
  | 'desk'
  | 'standingDesk'
  | 'chair'
  | 'plant'
  | 'bigPlant'
  | 'couch'
  | 'beanbag'
  | 'serverRack'
  | 'console'
  | 'coolingUnit'
  | 'counter'
  | 'coffeeMachine'
  | 'fridge'
  | 'vending'
  | 'cafeTable'
  | 'confTable'
  | 'bigScreen'
  | 'whiteboard'
  | 'cabinet'
  | 'shelf'
  | 'boxes'
  | 'printer'
  | 'execDesk'
  | 'bookshelf'
  | 'trophy'
  | 'rug'
  | 'receptionDesk'
  | 'scanner'
  | 'turnstile'
  | 'monitorWall'
  | 'tv'
  | 'arcade'
  | 'pingpong'
  | 'neonSign'
  | 'electricPanel'
  | 'boiler'
  | 'pipes'
  | 'waterCooler'
  | 'networkRack'
  | 'partsShelf'
  | 'alarmPanel'
  | 'aquarium'
  | 'logoWall';

export interface Furniture {
  id: string;
  kind: FurnitureKind;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Visual height in tile units. */
  z?: number;
  /** false = decorative, walkable (rugs, chairs). Default true. */
  solid?: boolean;
  /** Free-form variant/facing hint for the renderer. */
  variant?: string;
}

let fid = 0;
function f(kind: FurnitureKind, x: number, y: number, w: number, h: number, extra: Partial<Furniture> = {}): Furniture {
  return { id: `f${fid++}`, kind, x, y, w, h, ...extra };
}

/** Desk pod = 2×2 desks with chairs on the outside edges. */
function deskPod(x: number, y: number, variant = 'a'): Furniture[] {
  return [
    f('desk', x, y, 1.5, 1, { variant: variant + '-n' }),
    f('desk', x + 1.5, y, 1.5, 1, { variant: variant + '-n' }),
    f('desk', x, y + 1, 1.5, 1, { variant: variant + '-s' }),
    f('desk', x + 1.5, y + 1, 1.5, 1, { variant: variant + '-s' }),
    f('chair', x + 0.45, y - 0.65, 0.6, 0.6, { solid: false, variant: 's' }),
    f('chair', x + 1.95, y - 0.65, 0.6, 0.6, { solid: false, variant: 's' }),
    f('chair', x + 0.45, y + 2.05, 0.6, 0.6, { solid: false, variant: 'n' }),
    f('chair', x + 1.95, y + 2.05, 0.6, 0.6, { solid: false, variant: 'n' }),
  ];
}

export const FURNITURE: Furniture[] = [
  // ---------------- Server Room ----------------
  f('rug', 3.2, 3.6, 4.6, 0.5, { solid: false, variant: 'cable' }),
  f('serverRack', 1.1, 1.1, 0.9, 0.9, { z: 1.7 }),
  f('serverRack', 2.1, 1.1, 0.9, 0.9, { z: 1.7 }),
  f('serverRack', 3.1, 1.1, 0.9, 0.9, { z: 1.7 }),
  f('console', 4.35, 1.1, 1.3, 0.8, { z: 0.9, variant: 'server' }),
  f('serverRack', 6.0, 1.1, 0.9, 0.9, { z: 1.7 }),
  f('serverRack', 7.0, 1.1, 0.9, 0.9, { z: 1.7 }),
  f('serverRack', 8.0, 1.1, 0.9, 0.9, { z: 1.7 }),
  f('serverRack', 3.0, 4.6, 0.9, 0.9, { z: 1.7 }),
  f('serverRack', 4.0, 4.6, 0.9, 0.9, { z: 1.7 }),
  f('serverRack', 6.0, 4.6, 0.9, 0.9, { z: 1.7 }),
  f('serverRack', 7.0, 4.6, 0.9, 0.9, { z: 1.7 }),
  f('console', 1.1, 6.4, 0.8, 1.2, { z: 0.9, variant: 'critA' }),
  f('console', 9.1, 6.4, 0.8, 1.2, { z: 0.9, variant: 'critB' }),
  f('coolingUnit', 1.1, 8.7, 1.2, 0.9, { z: 1.1 }),
  f('coolingUnit', 6.0, 8.7, 1.2, 0.9, { z: 1.1 }),

  // ---------------- IT Support ----------------
  f('networkRack', 12.8, 1.1, 1.3, 0.8, { z: 1.4 }),
  f('partsShelf', 15.0, 1.1, 1.6, 0.7, { z: 1.4 }),
  f('partsShelf', 16.8, 1.1, 1.6, 0.7, { z: 1.4 }),
  f('console', 19.1, 4.0, 0.8, 1.2, { z: 1.0, variant: 'network' }),
  f('desk', 12.2, 5.2, 1.5, 1, { variant: 'help-s' }),
  f('desk', 14.6, 5.2, 1.5, 1, { variant: 'help-s' }),
  f('chair', 12.65, 6.4, 0.6, 0.6, { solid: false, variant: 'n' }),
  f('chair', 15.05, 6.4, 0.6, 0.6, { solid: false, variant: 'n' }),
  f('plant', 11.15, 8.85, 0.7, 0.7, { z: 1.1 }),
  f('boxes', 18.6, 8.4, 1.0, 1.0, { z: 0.8 }),
  f('beanbag', 17.0, 7.6, 1.0, 1.0, { z: 0.5, variant: 'cyan' }),

  // ---------------- CEO Cabin ----------------
  f('rug', 22.6, 4.6, 6.0, 3.6, { solid: false, variant: 'royal' }),
  f('bookshelf', 21.1, 1.1, 1.8, 0.7, { z: 1.6 }),
  f('trophy', 23.3, 1.15, 0.7, 0.7, { z: 1.3 }),
  f('aquarium', 27.4, 1.1, 2.4, 0.8, { z: 1.2 }),
  f('execDesk', 24.6, 2.6, 1.6, 1.1, { z: 0.6 }),
  f('chair', 25.1, 2.0, 0.65, 0.65, { solid: false, variant: 'exec' }),
  f('couch', 21.2, 6.6, 1.0, 1.1, { z: 0.6, variant: 'leather-e' }),
  f('couch', 21.2, 7.7, 1.0, 1.1, { z: 0.6, variant: 'leather-e' }),
  f('bigPlant', 29.9, 4.3, 0.9, 0.9, { z: 1.6 }),
  f('plant', 21.2, 4.0, 0.7, 0.7, { z: 1.1 }),

  // ---------------- HR Department ----------------
  f('cabinet', 32.1, 1.1, 0.9, 0.7, { z: 1.2 }),
  f('cabinet', 33.1, 1.1, 0.9, 0.7, { z: 1.2 }),
  f('whiteboard', 34.6, 1.1, 1.8, 0.4, { z: 1.4, variant: 'hr' }),
  f('console', 40.1, 1.8, 0.8, 1.2, { z: 1.0, variant: 'outage' }),
  f('desk', 33.0, 4.4, 1.5, 1, { variant: 'hr-s' }),
  f('desk', 35.6, 4.4, 1.5, 1, { variant: 'hr-s' }),
  f('chair', 33.45, 5.6, 0.6, 0.6, { solid: false, variant: 'n' }),
  f('chair', 36.05, 5.6, 0.6, 0.6, { solid: false, variant: 'n' }),
  f('waterCooler', 38.4, 1.1, 0.7, 0.7, { z: 1.3 }),
  f('plant', 32.15, 7.6, 0.7, 0.7, { z: 1.1 }),
  f('couch', 33.3, 8.6, 1.1, 1.0, { z: 0.6, variant: 'lilac-n' }),
  f('couch', 34.4, 8.6, 1.1, 1.0, { z: 0.6, variant: 'lilac-n' }),

  // ---------------- Security Office ----------------
  f('monitorWall', 43.6, 1.1, 2.6, 0.7, { z: 1.6 }),
  f('desk', 43.9, 2.6, 1.5, 0.9, { variant: 'sec-s' }),
  f('chair', 44.35, 3.65, 0.6, 0.6, { solid: false, variant: 'n' }),
  f('console', 48.1, 4.0, 0.8, 1.1, { z: 1.0, variant: 'cctv' }),
  f('console', 48.1, 6.6, 0.8, 1.1, { z: 1.0, variant: 'doors' }),
  f('scanner', 42.1, 5.1, 0.8, 0.8, { z: 1.2 }),
  f('plant', 42.15, 8.8, 0.7, 0.7, { z: 1.1 }),

  // ---------------- North hallway ----------------
  f('plant', 10.1, 11.1, 0.7, 0.7, { z: 1.1 }),
  f('vending', 21.0, 11.05, 1.0, 0.75, { z: 1.5 }),
  f('plant', 40.1, 11.1, 0.7, 0.7, { z: 1.1 }),
  f('waterCooler', 30.3, 11.1, 0.7, 0.6, { z: 1.3 }),

  // ---------------- Open Workspace ----------------
  ...deskPod(2.5, 16.4, 'a'),
  ...deskPod(8.0, 16.4, 'b'),
  ...deskPod(13.5, 16.4, 'c'),
  ...deskPod(2.5, 21.0, 'd'),
  ...deskPod(8.0, 21.0, 'e'),
  f('whiteboard', 13.6, 14.05, 2.4, 0.4, { z: 1.4, variant: 'okr' }),
  f('cabinet', 20.6, 14.1, 0.9, 0.7, { z: 1.2 }),
  f('cabinet', 21.6, 14.1, 0.9, 0.7, { z: 1.2 }),
  f('cabinet', 22.6, 14.1, 0.9, 0.7, { z: 1.2 }),
  f('standingDesk', 19.3, 17.0, 1.4, 0.9, { z: 1.0 }),
  f('standingDesk', 19.3, 18.4, 1.4, 0.9, { z: 1.0 }),
  f('couch', 14.6, 23.9, 1.1, 1.0, { z: 0.6, variant: 'mint-n' }),
  f('couch', 15.7, 23.9, 1.1, 1.0, { z: 0.6, variant: 'mint-n' }),
  f('beanbag', 18.6, 22.3, 1.0, 1.0, { z: 0.5, variant: 'orange' }),
  f('beanbag', 20.2, 23.3, 1.0, 1.0, { z: 0.5, variant: 'purple' }),
  f('bigPlant', 23.9, 21.0, 0.9, 0.9, { z: 1.6 }),
  f('plant', 1.15, 14.1, 0.7, 0.7, { z: 1.1 }),
  f('console', 1.1, 22.9, 0.8, 1.1, { z: 1.0, variant: 'outage' }),

  // ---------------- Conference Room ----------------
  f('rug', 27.6, 16.0, 9.0, 7.0, { solid: false, variant: 'conf' }),
  f('bigScreen', 33.5, 14.05, 3.4, 0.45, { z: 1.5 }),
  f('confTable', 29.0, 18.0, 2.0, 2.0, { z: 0.55, variant: 'w' }),
  f('confTable', 31.0, 18.0, 2.0, 2.0, { z: 0.55, variant: 'm' }),
  f('confTable', 33.0, 18.0, 2.0, 2.0, { z: 0.55, variant: 'e' }),
  f('chair', 29.6, 17.2, 0.6, 0.6, { solid: false, variant: 's' }),
  f('chair', 31.7, 17.2, 0.6, 0.6, { solid: false, variant: 's' }),
  f('chair', 33.8, 17.2, 0.6, 0.6, { solid: false, variant: 's' }),
  f('chair', 29.6, 20.2, 0.6, 0.6, { solid: false, variant: 'n' }),
  f('chair', 31.7, 20.2, 0.6, 0.6, { solid: false, variant: 'n' }),
  f('chair', 33.8, 20.2, 0.6, 0.6, { solid: false, variant: 'n' }),
  f('plant', 26.15, 14.1, 0.7, 0.7, { z: 1.1 }),
  f('plant', 37.15, 14.1, 0.7, 0.7, { z: 1.1 }),
  f('plant', 37.15, 24.2, 0.7, 0.7, { z: 1.1 }),

  // ---------------- Gaming Room ----------------
  f('neonSign', 40.0, 14.02, 2.6, 0.2, { z: 1.4, variant: 'play' }),
  f('tv', 45.4, 14.05, 2.2, 0.5, { z: 1.3 }),
  f('rug', 43.6, 16.0, 3.0, 2.6, { solid: false, variant: 'neon' }),
  f('couch', 44.0, 19.0, 1.1, 1.0, { z: 0.6, variant: 'navy-n' }),
  f('couch', 45.1, 19.0, 1.1, 1.0, { z: 0.6, variant: 'navy-n' }),
  f('beanbag', 42.2, 17.0, 1.0, 1.0, { z: 0.5, variant: 'cyan' }),
  f('beanbag', 47.2, 16.6, 1.0, 1.0, { z: 0.5, variant: 'pink' }),
  f('arcade', 48.1, 19.5, 0.8, 0.8, { z: 1.7 }),
  f('arcade', 48.1, 20.6, 0.8, 0.8, { z: 1.7 }),
  f('pingpong', 40.6, 21.6, 1.4, 1.4, { z: 0.6, variant: 'w' }),
  f('pingpong', 42.0, 21.6, 1.4, 1.4, { z: 0.6, variant: 'e' }),

  // ---------------- South hallway ----------------
  f('plant', 1.15, 26.1, 0.7, 0.7, { z: 1.1 }),
  f('plant', 48.15, 26.1, 0.7, 0.7, { z: 1.1 }),
  f('vending', 24.0, 26.05, 1.0, 0.75, { z: 1.5, variant: 'snack' }),

  // ---------------- Printer & Storage ----------------
  f('printer', 3.6, 29.15, 1.5, 1.0, { z: 1.0 }),
  f('shelf', 1.1, 31.0, 0.7, 1.6, { z: 1.6 }),
  f('shelf', 1.1, 33.0, 0.7, 1.6, { z: 1.6 }),
  f('shelf', 6.5, 29.1, 1.6, 0.7, { z: 1.6 }),
  f('boxes', 8.6, 29.2, 1.0, 1.0, { z: 0.9 }),
  f('boxes', 9.6, 33.5, 1.0, 1.0, { z: 1.2 }),
  f('boxes', 5.0, 34.0, 1.2, 1.2, { z: 0.7, variant: 'paper' }),
  f('cabinet', 9.8, 36.0, 0.9, 0.9, { z: 1.2 }),

  // ---------------- Main Reception ----------------
  f('logoWall', 13.0, 29.05, 4.6, 0.3, { z: 1.5 }),
  f('rug', 14.0, 33.0, 6.0, 4.0, { solid: false, variant: 'brand' }),
  f('receptionDesk', 16.0, 31.0, 1.5, 1.1, { z: 0.8, variant: 'l' }),
  f('receptionDesk', 17.5, 31.0, 1.5, 1.1, { z: 0.8, variant: 'm' }),
  f('receptionDesk', 19.0, 31.0, 1.5, 1.1, { z: 0.8, variant: 'r' }),
  f('scanner', 12.1, 30.3, 0.8, 0.8, { z: 1.2 }),
  f('turnstile', 12.2, 34.6, 0.6, 1.2, { z: 0.8 }),
  f('couch', 14.4, 37.7, 1.1, 1.0, { z: 0.6, variant: 'blue-n' }),
  f('couch', 15.5, 37.7, 1.1, 1.0, { z: 0.6, variant: 'blue-n' }),
  f('bigPlant', 21.6, 37.6, 0.9, 0.9, { z: 1.6 }),
  f('plant', 25.15, 37.9, 0.7, 0.7, { z: 1.1 }),
  f('alarmPanel', 25.4, 30.0, 0.5, 0.9, { z: 1.2 }),
  f('console', 12.1, 36.9, 0.8, 1.0, { z: 1.0, variant: 'outage' }),

  // ---------------- Cafeteria ----------------
  f('counter', 27.1, 29.1, 1.2, 0.8, { z: 0.9 }),
  f('coffeeMachine', 28.3, 29.1, 1.2, 0.8, { z: 1.2 }),
  f('counter', 29.5, 29.1, 1.2, 0.8, { z: 0.9, variant: 'fruit' }),
  f('fridge', 31.0, 29.1, 1.0, 0.8, { z: 1.7 }),
  f('vending', 35.2, 29.1, 1.0, 0.75, { z: 1.5, variant: 'drink' }),
  f('cafeTable', 29.0, 32.4, 1.2, 1.2, { z: 0.55 }),
  f('cafeTable', 33.0, 32.4, 1.2, 1.2, { z: 0.55 }),
  f('cafeTable', 29.0, 35.6, 1.2, 1.2, { z: 0.55 }),
  f('cafeTable', 33.0, 35.6, 1.2, 1.2, { z: 0.55 }),
  f('chair', 28.3, 32.7, 0.55, 0.55, { solid: false, variant: 'e' }),
  f('chair', 30.35, 32.7, 0.55, 0.55, { solid: false, variant: 'w' }),
  f('chair', 32.3, 32.7, 0.55, 0.55, { solid: false, variant: 'e' }),
  f('chair', 34.35, 32.7, 0.55, 0.55, { solid: false, variant: 'w' }),
  f('chair', 28.3, 35.9, 0.55, 0.55, { solid: false, variant: 'e' }),
  f('chair', 30.35, 35.9, 0.55, 0.55, { solid: false, variant: 'w' }),
  f('chair', 32.3, 35.9, 0.55, 0.55, { solid: false, variant: 'e' }),
  f('chair', 34.35, 35.9, 0.55, 0.55, { solid: false, variant: 'w' }),
  f('bigPlant', 37.9, 33.0, 0.9, 0.9, { z: 1.6 }),
  f('alarmPanel', 38.5, 36.6, 0.5, 0.9, { z: 1.2 }),

  // ---------------- Maintenance & Electrical ----------------
  f('electricPanel', 46.3, 29.1, 1.6, 0.6, { z: 1.5 }),
  f('boiler', 40.2, 29.2, 1.2, 1.2, { z: 1.7 }),
  f('pipes', 48.45, 34.2, 0.4, 2.4, { z: 1.6 }),
  f('boxes', 40.3, 33.4, 1.1, 1.1, { z: 1.0 }),
  f('boxes', 41.4, 33.6, 0.9, 0.9, { z: 0.7, variant: 'paper' }),
  f('shelf', 48.15, 32.0, 0.7, 1.6, { z: 1.6 }),
  f('boiler', 43.0, 36.6, 1.2, 1.2, { z: 1.4, variant: 'small' }),
];

// ---------------------------------------------------------------------------
// Interactive stations
// ---------------------------------------------------------------------------

export type StationKind =
  | 'task'
  | 'emergency'
  | 'fix'
  | 'cctv'
  | 'vent';

export type FixTarget =
  | 'wifi'
  | 'fireA'
  | 'fireB'
  | 'power'
  | 'doorsOverride'
  | 'serverA'
  | 'serverB'
  | 'cctv'
  | 'outageA'
  | 'outageB'
  | 'outageC';

export interface Station {
  id: string;
  kind: StationKind;
  name: string;
  room: RoomId;
  /** Interaction point on the walkable floor. */
  x: number;
  y: number;
  taskType?: import('./tasks').TaskType;
  fix?: FixTarget;
  /** Electronic stations stop working during Wi-Fi / outage sabotage. */
  electronic?: boolean;
  /** Needs network (disabled by Wi-Fi sabotage). */
  network?: boolean;
}

export const STATIONS: Station[] = [
  // tasks
  { id: 't-wifi', kind: 'task', taskType: 'wifi', name: 'Network Switch', room: 'it', x: 13.45, y: 2.55, electronic: true },
  { id: 't-expense', kind: 'task', taskType: 'expense', name: 'Accounting Desk', room: 'workspace', x: 3.25, y: 15.35, electronic: true, network: true },
  { id: 't-coffee', kind: 'task', taskType: 'coffee', name: 'Coffee Machine', room: 'cafeteria', x: 28.9, y: 30.6 },
  { id: 't-printer', kind: 'task', taskType: 'printer', name: 'Office Printer', room: 'printer', x: 4.35, y: 30.75, electronic: true },
  { id: 't-meeting', kind: 'task', taskType: 'meeting', name: 'Meeting Laptop', room: 'conference', x: 28.1, y: 19.0, electronic: true, network: true },
  { id: 't-files', kind: 'task', taskType: 'files', name: 'Filing Cabinets', room: 'workspace', x: 21.6, y: 15.5 },
  { id: 't-emails', kind: 'task', taskType: 'emails', name: "CEO's Computer", room: 'ceo', x: 25.4, y: 4.35, electronic: true, network: true },
  { id: 't-server', kind: 'task', taskType: 'server', name: 'Server Terminal', room: 'server', x: 5.0, y: 2.5, electronic: true },
  { id: 't-excel', kind: 'task', taskType: 'excel', name: 'Finance Workstation', room: 'workspace', x: 9.55, y: 23.6, electronic: true, network: true },
  { id: 't-idscan', kind: 'task', taskType: 'idscan', name: 'ID Scanner', room: 'reception', x: 13.4, y: 30.7, electronic: true },
  { id: 't-idscan2', kind: 'task', taskType: 'idscan', name: 'Security ID Scanner', room: 'security', x: 43.4, y: 5.5, electronic: true },
  { id: 't-expense2', kind: 'task', taskType: 'expense', name: 'HR Reimbursements', room: 'hr', x: 33.75, y: 6.6, electronic: true, network: true },
  { id: 't-emails2', kind: 'task', taskType: 'emails', name: 'Help Desk Inbox', room: 'it', x: 12.95, y: 7.4, electronic: true, network: true },
  { id: 't-excel2', kind: 'task', taskType: 'excel', name: 'Budget Spreadsheet', room: 'workspace', x: 15.0, y: 15.35, electronic: true, network: true },

  // emergency button on the conference table
  { id: 'emergency', kind: 'emergency', name: 'Emergency HR Button', room: 'conference', x: 32.0, y: 19.0 },

  // sabotage repair stations
  { id: 'fix-wifi', kind: 'fix', fix: 'wifi', name: 'Network Terminal', room: 'it', x: 18.5, y: 4.6 },
  { id: 'fix-fireA', kind: 'fix', fix: 'fireA', name: 'Fire Panel (Reception)', room: 'reception', x: 24.6, y: 30.45 },
  { id: 'fix-fireB', kind: 'fix', fix: 'fireB', name: 'Fire Panel (Cafeteria)', room: 'cafeteria', x: 37.8, y: 37.05 },
  { id: 'fix-power', kind: 'fix', fix: 'power', name: 'Electrical Panel', room: 'maintenance', x: 47.1, y: 30.45 },
  { id: 'fix-doors', kind: 'fix', fix: 'doorsOverride', name: 'Door Override', room: 'security', x: 47.4, y: 7.15 },
  { id: 'fix-serverA', kind: 'fix', fix: 'serverA', name: 'Server Core A', room: 'server', x: 2.4, y: 7.0 },
  { id: 'fix-serverB', kind: 'fix', fix: 'serverB', name: 'Server Core B', room: 'server', x: 8.6, y: 7.0 },
  { id: 'fix-cctv', kind: 'fix', fix: 'cctv', name: 'Security Control', room: 'security', x: 47.4, y: 4.55 },
  { id: 'fix-outageA', kind: 'fix', fix: 'outageA', name: 'Workspace Systems', room: 'workspace', x: 2.25, y: 23.6 },
  { id: 'fix-outageB', kind: 'fix', fix: 'outageB', name: 'HR Systems', room: 'hr', x: 39.6, y: 2.4 },
  { id: 'fix-outageC', kind: 'fix', fix: 'outageC', name: 'Reception Systems', room: 'reception', x: 13.4, y: 37.4 },

  // security monitors
  { id: 'cctv', kind: 'cctv', name: 'Security Monitors', room: 'security', x: 44.85, y: 4.55, electronic: true },
];

export const STATION_BY_ID: Record<string, Station> = Object.fromEntries(STATIONS.map((s) => [s.id, s]));

// ---------------------------------------------------------------------------
// Secret maintenance passages (vents)
// ---------------------------------------------------------------------------

export interface Vent {
  id: string;
  room: RoomId;
  x: number;
  y: number;
  links: string[];
}

export const VENTS: Vent[] = [
  { id: 'v-server', room: 'server', x: 8.3, y: 8.3, links: ['v-workspace', 'v-printer'] },
  { id: 'v-workspace', room: 'workspace', x: 6.2, y: 19.7, links: ['v-server', 'v-printer'] },
  { id: 'v-printer', room: 'printer', x: 2.4, y: 37.4, links: ['v-server', 'v-workspace'] },
  { id: 'v-ceo', room: 'ceo', x: 29.6, y: 8.4, links: ['v-hr', 'v-security'] },
  { id: 'v-hr', room: 'hr', x: 39.4, y: 7.6, links: ['v-ceo', 'v-security'] },
  { id: 'v-security', room: 'security', x: 47.6, y: 8.6, links: ['v-ceo', 'v-hr'] },
  { id: 'v-gaming', room: 'gaming', x: 47.4, y: 23.6, links: ['v-maint', 'v-cafe'] },
  { id: 'v-maint', room: 'maintenance', x: 47.4, y: 37.4, links: ['v-gaming', 'v-cafe'] },
  { id: 'v-cafe', room: 'cafeteria', x: 37.5, y: 30.3, links: ['v-gaming', 'v-maint'] },
];
export const VENT_BY_ID: Record<string, Vent> = Object.fromEntries(VENTS.map((v) => [v.id, v]));

// ---------------------------------------------------------------------------
// CCTV camera zones
// ---------------------------------------------------------------------------

export interface CameraDef {
  id: string;
  name: string;
  box: Box;
}
export const CAMERAS: CameraDef[] = [
  { id: 'cam-hallN', name: 'CAM 01 · North Hallway', box: { x0: 1, y0: 11, x1: 49, y1: 13 } },
  { id: 'cam-recep', name: 'CAM 02 · Reception', box: { x0: 12, y0: 29, x1: 26, y1: 39 } },
  { id: 'cam-cafe', name: 'CAM 03 · Cafeteria', box: { x0: 27, y0: 29, x1: 39, y1: 39 } },
  { id: 'cam-hallS', name: 'CAM 04 · South Hallway', box: { x0: 1, y0: 26, x1: 49, y1: 28 } },
];

// ---------------------------------------------------------------------------
// Spawn points
// ---------------------------------------------------------------------------

/** Around the conference table — used at match start and after meetings. */
export const MEETING_SPAWNS: [number, number][] = [
  [29.6, 16.6],
  [31.2, 16.6],
  [32.8, 16.6],
  [34.4, 16.6],
  [36.3, 19.0],
  [34.4, 21.5],
  [32.8, 21.5],
  [31.2, 21.5],
  [29.6, 21.5],
  [27.4, 17.0],
];

/** Lobby lounge = Main Reception. */
export const LOBBY_SPAWNS: [number, number][] = [
  [15.0, 34.5],
  [17.0, 34.5],
  [19.0, 34.5],
  [21.0, 34.5],
  [15.0, 36.2],
  [17.0, 36.2],
  [19.0, 36.2],
  [21.0, 36.2],
  [23.0, 33.5],
  [23.0, 35.5],
];

// ---------------------------------------------------------------------------
// Grid + colliders (generated)
// ---------------------------------------------------------------------------

export interface MapData {
  grid: Uint8Array;
  roomGrid: (RoomId | null)[];
  walls: WallPiece[];
  doorTiles: Map<string, DoorDef>;
  /** colliders that never change */
  staticColliders: Box[];
  /** per lockable door: the box blocking it while locked */
  lockColliders: Map<string, Box[]>;
}

const idx = (x: number, y: number) => y * MAP_W + x;

function buildMap(): MapData {
  const grid = new Uint8Array(MAP_W * MAP_H).fill(Tile.Wall);
  const roomGrid: (RoomId | null)[] = new Array(MAP_W * MAP_H).fill(null);
  for (const r of ROOMS) {
    for (let y = r.y0; y <= r.y1; y++)
      for (let x = r.x0; x <= r.x1; x++) {
        grid[idx(x, y)] = Tile.Floor;
        roomGrid[idx(x, y)] = r.id;
      }
  }
  const doorTiles = new Map<string, DoorDef>();
  for (const d of DOORS) {
    for (const [x, y] of d.tiles) {
      grid[idx(x, y)] = Tile.Door;
      doorTiles.set(`${x},${y}`, d);
    }
  }
  // Door tiles take the room of an adjacent hallway or room (for room lookup).
  for (const d of DOORS) {
    for (const [x, y] of d.tiles) {
      const n =
        d.orient === 'h' ? [roomGrid[idx(x, y + 1)], roomGrid[idx(x, y - 1)]] : [roomGrid[idx(x - 1, y)], roomGrid[idx(x + 1, y)]];
      roomGrid[idx(x, y)] = n.find((r) => r && ROOM_BY_ID[r].isHall) ?? n.find(Boolean) ?? null;
    }
  }
  // Walls with no walkable neighbour (8-neighbourhood) are void.
  const walkable = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < MAP_W && y < MAP_H && (grid[idx(x, y)] === Tile.Floor || grid[idx(x, y)] === Tile.Door);
  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < MAP_W; x++) {
      if (grid[idx(x, y)] !== Tile.Wall) continue;
      let any = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (walkable(x + dx, y + dy)) any = true;
      if (!any) grid[idx(x, y)] = Tile.Void;
    }
  // Conference room walls are glass.
  const conf = ROOM_BY_ID.conference;
  for (let y = conf.y0 - 1; y <= conf.y1 + 1; y++)
    for (let x = conf.x0 - 1; x <= conf.x1 + 1; x++) {
      const onEdge = x === conf.x0 - 1 || x === conf.x1 + 1 || y === conf.y0 - 1 || y === conf.y1 + 1;
      if (onEdge && grid[idx(x, y)] === Tile.Wall) grid[idx(x, y)] = Tile.Glass;
    }

  const isWall = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return false;
    const t = grid[idx(x, y)];
    return t === Tile.Wall || t === Tile.Glass;
  };
  const isWallOrDoor = (x: number, y: number) => isWall(x, y) || (x >= 0 && y >= 0 && x < MAP_W && y < MAP_H && grid[idx(x, y)] === Tile.Door);

  const T0 = 0.32;
  const T1 = 0.68;
  const walls: WallPiece[] = [];
  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < MAP_W; x++) {
      if (!isWall(x, y)) continue;
      const glass = grid[idx(x, y)] === Tile.Glass;
      const e = isWallOrDoor(x + 1, y);
      const w = isWallOrDoor(x - 1, y);
      const n = isWallOrDoor(x, y - 1);
      const s = isWallOrDoor(x, y + 1);
      const horiz = e || w;
      const vert = n || s;
      if (horiz) walls.push({ tx: x, ty: y, glass, x0: x + (w ? 0 : T0), x1: x + (e ? 1 : T1), y0: y + T0, y1: y + T1 });
      if (vert) {
        // Avoid double-covering the centre square when both exist.
        const y0 = y + (n ? 0 : T0);
        const y1 = y + (s ? 1 : T1);
        if (horiz) {
          if (n) walls.push({ tx: x, ty: y, glass, x0: x + T0, x1: x + T1, y0, y1: y + T0 });
          if (s) walls.push({ tx: x, ty: y, glass, x0: x + T0, x1: x + T1, y0: y + T1, y1 });
        } else walls.push({ tx: x, ty: y, glass, x0: x + T0, x1: x + T1, y0, y1 });
      }
      if (!horiz && !vert) walls.push({ tx: x, ty: y, glass, x0: x + T0, x1: x + T1, y0: y + T0, y1: y + T1 });
    }

  const staticColliders: Box[] = walls.map((w) => ({ x0: w.x0, y0: w.y0, x1: w.x1, y1: w.y1 }));
  for (const fu of FURNITURE) {
    if (fu.solid === false) continue;
    staticColliders.push({ x0: fu.x, y0: fu.y, x1: fu.x + fu.w, y1: fu.y + fu.h });
  }
  // Map boundary
  staticColliders.push({ x0: -5, y0: -5, x1: MAP_W + 5, y1: 0 });
  staticColliders.push({ x0: -5, y0: MAP_H, x1: MAP_W + 5, y1: MAP_H + 5 });
  staticColliders.push({ x0: -5, y0: -5, x1: 0, y1: MAP_H + 5 });
  staticColliders.push({ x0: MAP_W, y0: -5, x1: MAP_W + 5, y1: MAP_H + 5 });

  const lockColliders = new Map<string, Box[]>();
  for (const d of DOORS) {
    if (!d.lockable) continue;
    lockColliders.set(
      d.id,
      d.tiles.map(([x, y]) =>
        d.orient === 'h' ? { x0: x, x1: x + 1, y0: y + T0, y1: y + T1 } : { x0: x + T0, x1: x + T1, y0: y, y1: y + 1 },
      ),
    );
  }
  return { grid, roomGrid, walls, doorTiles, staticColliders, lockColliders };
}

export const MAP: MapData = buildMap();

export function tileAt(x: number, y: number): Tile {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return Tile.Void;
  return MAP.grid[idx(tx, ty)] as Tile;
}

export function roomAt(x: number, y: number): RoomId | null {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return null;
  return MAP.roomGrid[idx(tx, ty)];
}

export function roomName(id: RoomId | null): string {
  return id ? ROOM_BY_ID[id].name : 'Somewhere';
}
