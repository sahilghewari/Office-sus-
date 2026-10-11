import { randomInt } from 'node:crypto';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, type Phase } from '@corp/shared';

/**
 * Room directory: where does room CODE live, and which public rooms are open?
 * Memory implementation for single-instance deploys; Redis implementation lets
 * several room-server instances share codes and matchmaking.
 */
export interface RoomListing {
  code: string;
  instanceUrl: string | null;
  isPublic: boolean;
  phase: Phase;
  players: number;
  capacity: number;
  updatedAt: number;
}

export interface RoomDirectory {
  readonly kind: 'memory' | 'redis';
  reserveCode(): Promise<string>;
  upsert(l: RoomListing): Promise<void>;
  remove(code: string): Promise<void>;
  get(code: string): Promise<RoomListing | null>;
  listPublicOpen(): Promise<RoomListing[]>;
  close(): Promise<void>;
}

export function generateCode(): string {
  let s = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) s += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  return s;
}

export class MemoryDirectory implements RoomDirectory {
  readonly kind = 'memory' as const;
  private rooms = new Map<string, RoomListing>();
  private reserved = new Set<string>();
  async reserveCode() {
    for (let i = 0; i < 1000; i++) {
      const c = generateCode();
      if (!this.rooms.has(c) && !this.reserved.has(c)) {
        this.reserved.add(c);
        return c;
      }
    }
    throw new Error('Could not allocate a room code');
  }
  async upsert(l: RoomListing) {
    this.reserved.delete(l.code);
    this.rooms.set(l.code, l);
  }
  async remove(code: string) {
    this.rooms.delete(code);
    this.reserved.delete(code);
  }
  async get(code: string) {
    return this.rooms.get(code) ?? null;
  }
  async listPublicOpen() {
    return [...this.rooms.values()].filter((r) => r.isPublic && r.phase === 'WAITING' && r.players < r.capacity);
  }
  async close() {}
}

export class RedisDirectory implements RoomDirectory {
  readonly kind = 'redis' as const;
  constructor(private redis: any) {}

  static async connect(url: string): Promise<RedisDirectory> {
    const { Redis } = await import('ioredis');
    const r = new Redis(url, { maxRetriesPerRequest: 2, lazyConnect: true });
    await r.connect();
    return new RedisDirectory(r);
  }
  async reserveCode() {
    for (let i = 0; i < 100; i++) {
      const c = generateCode();
      // SET NX guarantees uniqueness across instances
      const ok = await this.redis.set(`cs:room:${c}`, JSON.stringify({ reserved: true }), 'EX', 120, 'NX');
      if (ok) return c;
    }
    throw new Error('Could not allocate a room code');
  }
  async upsert(l: RoomListing) {
    await this.redis.set(`cs:room:${l.code}`, JSON.stringify(l), 'EX', 120);
    if (l.isPublic && l.phase === 'WAITING' && l.players < l.capacity) await this.redis.zadd('cs:public', l.players, l.code);
    else await this.redis.zrem('cs:public', l.code);
  }
  async remove(code: string) {
    await this.redis.del(`cs:room:${code}`);
    await this.redis.zrem('cs:public', code);
  }
  async get(code: string) {
    const raw = await this.redis.get(`cs:room:${code}`);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return v.reserved ? null : (v as RoomListing);
  }
  async listPublicOpen() {
    const codes: string[] = await this.redis.zrevrange('cs:public', 0, 50);
    const out: RoomListing[] = [];
    for (const c of codes) {
      const l = await this.get(c);
      if (l && l.isPublic && l.phase === 'WAITING' && l.players < l.capacity) out.push(l);
      else await this.redis.zrem('cs:public', c);
    }
    return out;
  }
  async close() {
    await this.redis.quit();
  }
}

export async function createDirectory(url: string | null, log: (m: string) => void): Promise<RoomDirectory> {
  if (!url) return new MemoryDirectory();
  try {
    const d = await RedisDirectory.connect(url);
    log('Connected to Redis room directory.');
    return d;
  } catch (e) {
    log(`Redis unavailable (${(e as Error).message}); using in-memory directory.`);
    return new MemoryDirectory();
  }
}
