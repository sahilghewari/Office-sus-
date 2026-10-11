import { TICK_MS, type Appearance } from '@corp/shared';
import type { RoomDirectory } from '../matchmaking/directory';
import type { Store } from '../database/store';
import type { VoiceService } from '../voice/livekit';
import { GameRoom, type Conn, type Player } from './GameRoom';

export interface ManagerOptions {
  directory: RoomDirectory;
  store: Store;
  voice: VoiceService;
  instanceUrl: string | null;
  testHooks: boolean;
  log: (m: string) => void;
  /** disable the real-time loop (tests drive ticks manually) */
  manualTick?: boolean;
  now?: () => number;
}

const EMPTY_ROOM_TTL_MS = 60_000;

export class RoomManager {
  rooms = new Map<string, GameRoom>();
  private timer: NodeJS.Timeout | null = null;
  private emptySince = new Map<string, number>();
  private lastListing = new Map<string, string>();
  stats = { ticks: 0, tickMsTotal: 0, tickMsMax: 0 };

  constructor(private o: ManagerOptions) {
    if (!o.manualTick) this.startLoop();
  }

  private now() {
    return this.o.now ? this.o.now() : Date.now();
  }

  private startLoop() {
    let next = performance.now();
    const loop = () => {
      const start = performance.now();
      this.tickAll();
      const took = performance.now() - start;
      this.stats.ticks++;
      this.stats.tickMsTotal += took;
      this.stats.tickMsMax = Math.max(this.stats.tickMsMax, took);
      next += TICK_MS;
      const delay = Math.max(0, next - performance.now());
      if (delay === 0 && performance.now() - next > 1000) next = performance.now(); // fell far behind: resync
      this.timer = setTimeout(loop, delay);
    };
    this.timer = setTimeout(loop, TICK_MS);
  }

  tickAll() {
    const t = this.now();
    for (const room of this.rooms.values()) {
      try {
        room.tick();
      } catch (e) {
        this.o.log(`[${room.code}] tick error: ${(e as Error).stack}`);
      }
      if (room.isEmpty) {
        const since = this.emptySince.get(room.code) ?? t;
        this.emptySince.set(room.code, since);
        if (t - since > EMPTY_ROOM_TTL_MS) this.closeRoom(room.code);
      } else this.emptySince.delete(room.code);
    }
    if (this.stats.ticks % 100 === 0) for (const r of this.rooms.values()) this.publish(r, true);
  }

  async createRoom(isPublic: boolean): Promise<GameRoom> {
    const code = await this.o.directory.reserveCode();
    const room = new GameRoom(code, isPublic, {
      now: this.o.now,
      voice: this.o.voice,
      testHooks: this.o.testHooks,
      log: this.o.log,
      onChange: (r) => this.publish(r),
      onMatchEnd: (m) => {
        this.o.store.recordMatch(m).catch((e) => this.o.log(`Failed to record match: ${(e as Error).message}`));
      },
      onReport: (r) => {
        this.o.store.createReport(r).catch((e) => this.o.log(`Failed to store report: ${(e as Error).message}`));
      },
    });
    this.rooms.set(code, room);
    this.emptySince.set(code, this.now());
    await this.publish(room, true);
    this.o.log(`Room ${code} created (${isPublic ? 'public' : 'private'})`);
    return room;
  }

  get(code: string): GameRoom | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  async publish(room: GameRoom, force = false) {
    const listing = {
      code: room.code,
      instanceUrl: this.o.instanceUrl,
      isPublic: room.settings.isPublic,
      phase: room.phase,
      players: room.playerCount,
      capacity: room.settings.maxPlayers,
      updatedAt: this.now(),
    };
    const key = `${listing.isPublic}|${listing.phase}|${listing.players}|${listing.capacity}`;
    if (!force && this.lastListing.get(room.code) === key) return;
    this.lastListing.set(room.code, key);
    try {
      await this.o.directory.upsert(listing);
    } catch (e) {
      this.o.log(`directory upsert failed: ${(e as Error).message}`);
    }
  }

  /**
   * Quick Match: join the fullest open public lobby (on any instance when Redis
   * is configured), otherwise open a new public lobby that others will find.
   */
  async quickMatch(): Promise<{ code: string; instanceUrl: string | null; created: boolean }> {
    const open = await this.o.directory.listPublicOpen();
    open.sort((a, b) => b.players - a.players);
    for (const l of open) {
      const local = this.rooms.get(l.code);
      if (local) {
        if (local.phase === 'WAITING' && local.playerCount < local.settings.maxPlayers && local.settings.isPublic)
          return { code: l.code, instanceUrl: null, created: false };
        continue;
      }
      if (l.instanceUrl && l.instanceUrl !== this.o.instanceUrl) return { code: l.code, instanceUrl: l.instanceUrl, created: false };
    }
    const room = await this.createRoom(true);
    return { code: room.code, instanceUrl: null, created: true };
  }

  join(code: string, identity: string, name: string, appearance: Appearance, registered: boolean, conn: Conn) {
    const room = this.get(code);
    if (!room) return { error: 'ROOM_NOT_FOUND', message: 'No office found with that code. Check for typos.' } as const;
    const res = room.join(identity, name, appearance, registered, conn);
    if ('player' in res) {
      this.emptySince.delete(room.code);
      void this.publish(room);
      return { room, player: res.player as Player, reconnected: res.reconnected };
    }
    return res;
  }

  closeRoom(code: string) {
    const room = this.rooms.get(code);
    if (!room) return;
    room.dispose();
    this.rooms.delete(code);
    this.emptySince.delete(code);
    this.lastListing.delete(code);
    void this.o.directory.remove(code);
    this.o.log(`Room ${code} closed (empty)`);
  }

  totals() {
    let players = 0;
    for (const r of this.rooms.values()) players += [...r.players.values()].filter((p) => p.connected).length;
    return { rooms: this.rooms.size, players };
  }

  shutdown() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    for (const code of [...this.rooms.keys()]) this.closeRoom(code);
  }
}
