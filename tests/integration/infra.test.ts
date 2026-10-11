import { afterAll, describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE } from '@corp/shared';
import { PrismaStore } from '../../apps/server/src/database/store';
import { RedisDirectory } from '../../apps/server/src/matchmaking/directory';
import { createGameServer, type GameServer } from '../../apps/server/src/app';
import { MemoryStore } from '../../apps/server/src/database/store';
import { Bot } from '../support/bot';

/**
 * Real PostgreSQL + Redis integration. These run when the services are
 * reachable (TEST_DATABASE_URL / TEST_REDIS_URL) and are skipped otherwise.
 */
const PG = process.env.TEST_DATABASE_URL ?? 'postgresql://localhost:5432/corporate_sus_test';
const REDIS = process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:6379';

async function canConnectPg() {
  try {
    const s = await PrismaStore.connect(PG);
    await s.close();
    return true;
  } catch {
    return false;
  }
}
async function canConnectRedis() {
  try {
    const d = await RedisDirectory.connect(REDIS);
    await d.close();
    return true;
  } catch {
    return false;
  }
}
const pgOk = await canConnectPg();
const redisOk = await canConnectRedis();

describe.skipIf(!pgOk)('PostgreSQL store (Prisma)', () => {
  let store: PrismaStore;
  afterAll(async () => store && (await store.close()));
  it('users, sessions, profiles, matches and stats persist', async () => {
    store = await PrismaStore.connect(PG);
    const name = `pg_${Date.now() % 1e9}`;
    const u = await store.createUser(name, 'scrypt$hash', { ...DEFAULT_APPEARANCE, color: 'mint' });
    await expect(store.createUser(name.toUpperCase(), 'x', DEFAULT_APPEARANCE)).rejects.toThrow('USERNAME_TAKEN');
    expect((await store.getAppearance(u.id)).color).toBe('mint');
    await store.createSession(`sid-${name}`, u.id, new Date(Date.now() + 60_000));
    expect(await store.sessionValid(`sid-${name}`, u.id)).toBe(true);
    await store.deleteSession(`sid-${name}`);
    expect(await store.sessionValid(`sid-${name}`, u.id)).toBe(false);
    await store.recordMatch({
      roomCode: 'PGTEST',
      startedAt: new Date(Date.now() - 300_000),
      endedAt: new Date(),
      winningTeam: 'managers',
      reason: 'parity',
      players: [
        { userId: u.id, displayName: name, role: 'manager', won: true, tasksCompleted: 0, eliminations: 3 },
        { userId: null, displayName: 'Guest', role: 'employee', won: false, tasksCompleted: 2, eliminations: 0 },
      ],
    });
    const st = await store.getStats(u.id);
    expect(st).toMatchObject({ gamesPlayed: 1, wins: 1, managerWins: 1, eliminations: 3 });
    await store.createReport({ reporterUserId: u.id, reporterName: name, reportedId: 'g_x', reportedName: 'Troll', roomCode: 'PGTEST', category: 'spam' });
    await store.deleteUser(u.id);
    expect(await store.findUserById(u.id)).toBeNull();
    expect(await store.health()).toBe(true);
  });
});

describe.skipIf(!redisOk)('Redis room directory (multi-instance)', () => {
  it('codes are unique across instances and quick match finds rooms on other instances', async () => {
    process.env.REDIS_URL = REDIS;
    const a: GameServer = await createGameServer({ config: { port: 0, host: '127.0.0.1', redisUrl: REDIS, databaseUrl: null, livekit: null, instanceUrl: 'http://instance-a' }, store: new MemoryStore(), quiet: true });
    const b: GameServer = await createGameServer({ config: { port: 0, host: '127.0.0.1', redisUrl: REDIS, databaseUrl: null, livekit: null, instanceUrl: 'http://instance-b' }, store: new MemoryStore(), quiet: true });
    try {
      expect(a.directory.kind).toBe('redis');
      const codes = new Set<string>();
      for (let i = 0; i < 25; i++) codes.add(await (i % 2 ? a : b).directory.reserveCode());
      expect(codes.size).toBe(25);
      // a public lobby on A with one player
      const tok = await Bot.token(a.url);
      const room = await a.manager.createRoom(true);
      const bot = await new Bot(a.url, 'RedisBot', 1).connect(room.code, tok);
      await a.manager.publish(room, true);
      // quick match on B is pointed at A
      const r = await b.manager.quickMatch();
      expect(r.code).toBe(room.code);
      expect(r.instanceUrl).toBe('http://instance-a');
      // B can resolve the code too
      const info = await (await fetch(`${b.url}/api/rooms/${room.code}`)).json();
      expect(info.instanceUrl).toBe('http://instance-a');
      bot.close();
    } finally {
      await a.close();
      await b.close();
    }
  });
});
