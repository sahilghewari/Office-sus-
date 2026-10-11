import { DEFAULT_APPEARANCE, CHARACTER_COLORS, TICK_MS, type ClientMessage, type ServerMessage, type StateMsg } from '@corp/shared';
import { GameRoom, type Conn, type Player } from '../../apps/server/src/rooms/GameRoom';

/** In-process harness: a real GameRoom driven by a fake clock and fake sockets. */
export class FakeConn implements Conn {
  msgs: ServerMessage[] = [];
  closed = false;
  send(m: ServerMessage) {
    this.msgs.push(m);
  }
  close() {
    this.closed = true;
  }
  last<T extends ServerMessage['t']>(t: T): Extract<ServerMessage, { t: T }> | undefined {
    for (let i = this.msgs.length - 1; i >= 0; i--) if (this.msgs[i].t === t) return this.msgs[i] as any;
    return undefined;
  }
  all<T extends ServerMessage['t']>(t: T): Extract<ServerMessage, { t: T }>[] {
    return this.msgs.filter((m) => m.t === t) as any;
  }
  get state(): StateMsg {
    return this.last('state')!;
  }
  clear() {
    this.msgs = [];
  }
}

export class Sim {
  t = 1_000_000;
  room: GameRoom;
  conns = new Map<string, FakeConn>();
  players: Player[] = [];
  matches: any[] = [];
  reports: any[] = [];

  constructor(opts: { testHooks?: boolean; seed?: number; isPublic?: boolean } = {}) {
    this.room = new GameRoom('TESTAA', !!opts.isPublic, {
      now: () => this.t,
      seed: opts.seed ?? 1234,
      testHooks: opts.testHooks ?? true,
      onMatchEnd: (m) => this.matches.push(m),
      onReport: (r) => this.reports.push(r),
    });
  }

  add(name: string): Player {
    const c = new FakeConn();
    const i = this.players.length;
    const res = this.room.join(`g_${name}`, name, { ...DEFAULT_APPEARANCE, color: CHARACTER_COLORS[i].id }, false, c);
    if (!('player' in res)) throw new Error(res.message);
    this.conns.set(res.player.publicId, c);
    this.players.push(res.player);
    return res.player;
  }

  conn(p: Player): FakeConn {
    return this.conns.get(p.publicId)!;
  }

  send(p: Player, m: ClientMessage) {
    this.room.handle(p, m);
  }

  /** advance the fake clock, ticking the room at the real rate */
  advance(ms: number) {
    const steps = Math.ceil(ms / TICK_MS);
    for (let i = 0; i < steps; i++) {
      this.t += TICK_MS;
      this.room.tick();
    }
  }

  /** Lobby with N players, everyone ready, match started and ACTIVE. */
  startMatch(n: number, managers?: string[]): Player[] {
    const ps = Array.from({ length: n }, (_, i) => this.add(`P${i + 1}`));
    if (managers) this.send(ps[0], { t: 'test', cmd: 'forceManagers', args: { ids: managers.map((nm) => ps.find((p) => p.name === nm)!.publicId) } });
    for (const p of ps) this.send(p, { t: 'ready', ready: true });
    this.send(ps[0], { t: 'start' });
    this.advance(3100); // STARTING
    this.advance(5100); // ROLE_REVEAL
    return ps;
  }

  teleport(p: Player, x: number, y: number) {
    p.x = x;
    p.y = y;
    p.vx = p.vy = 0;
  }

  get managers() {
    return this.players.filter((p) => p.role === 'manager');
  }
  get employees() {
    return this.players.filter((p) => p.role === 'employee');
  }
}
