import { randomUUID } from 'node:crypto';
import { DEFAULT_APPEARANCE, type Appearance, type Role, type Team } from '@corp/shared';

/**
 * Persistence boundary. PostgreSQL (via Prisma) in production; an in-memory
 * implementation keeps local development and tests dependency-free.
 */

export interface UserRecord {
  id: string;
  username: string;
  passwordHash: string;
  createdAt: Date;
}

export interface ProfileStats {
  gamesPlayed: number;
  wins: number;
  losses: number;
  employeeWins: number;
  managerWins: number;
  tasksCompleted: number;
  eliminations: number;
}

export interface MatchRecordInput {
  roomCode: string;
  startedAt: Date;
  endedAt: Date;
  winningTeam: Team;
  reason: string;
  players: {
    userId: string | null;
    displayName: string;
    role: Role;
    won: boolean;
    tasksCompleted: number;
    eliminations: number;
  }[];
}

export interface ReportInput {
  reporterUserId: string | null;
  reporterName: string;
  reportedId: string;
  reportedName: string;
  roomCode: string;
  category: string;
  note?: string;
}

export interface Store {
  readonly kind: 'postgres' | 'memory';
  findUserByName(username: string): Promise<UserRecord | null>;
  findUserById(id: string): Promise<UserRecord | null>;
  createUser(username: string, passwordHash: string, appearance: Appearance): Promise<UserRecord>;
  deleteUser(id: string): Promise<void>;
  renameUser(id: string, username: string): Promise<void>;
  createSession(id: string, userId: string, expiresAt: Date): Promise<void>;
  sessionValid(id: string, userId: string): Promise<boolean>;
  deleteSession(id: string): Promise<void>;
  getAppearance(userId: string): Promise<Appearance>;
  setAppearance(userId: string, a: Appearance): Promise<void>;
  getStats(userId: string): Promise<ProfileStats>;
  recordMatch(m: MatchRecordInput): Promise<string>;
  createReport(r: ReportInput): Promise<void>;
  health(): Promise<boolean>;
  close(): Promise<void>;
}

const emptyStats = (): ProfileStats => ({
  gamesPlayed: 0,
  wins: 0,
  losses: 0,
  employeeWins: 0,
  managerWins: 0,
  tasksCompleted: 0,
  eliminations: 0,
});

export class MemoryStore implements Store {
  readonly kind = 'memory' as const;
  users = new Map<string, UserRecord>();
  sessions = new Map<string, { userId: string; expiresAt: Date }>();
  appearance = new Map<string, Appearance>();
  stats = new Map<string, ProfileStats>();
  matches: (MatchRecordInput & { id: string })[] = [];
  reports: ReportInput[] = [];

  async findUserByName(username: string) {
    const k = username.toLowerCase();
    for (const u of this.users.values()) if (u.username.toLowerCase() === k) return u;
    return null;
  }
  async findUserById(id: string) {
    return this.users.get(id) ?? null;
  }
  async createUser(username: string, passwordHash: string, appearance: Appearance) {
    if (await this.findUserByName(username)) throw new Error('USERNAME_TAKEN');
    const u = { id: randomUUID(), username, passwordHash, createdAt: new Date() };
    this.users.set(u.id, u);
    this.appearance.set(u.id, appearance);
    this.stats.set(u.id, emptyStats());
    return u;
  }
  async deleteUser(id: string) {
    this.users.delete(id);
    this.appearance.delete(id);
    this.stats.delete(id);
    for (const [k, s] of this.sessions) if (s.userId === id) this.sessions.delete(k);
    for (const m of this.matches) for (const p of m.players) if (p.userId === id) p.userId = null;
  }
  async renameUser(id: string, username: string) {
    const other = await this.findUserByName(username);
    if (other && other.id !== id) throw new Error('USERNAME_TAKEN');
    const u = this.users.get(id);
    if (u) u.username = username;
  }
  async createSession(id: string, userId: string, expiresAt: Date) {
    this.sessions.set(id, { userId, expiresAt });
  }
  async sessionValid(id: string, userId: string) {
    const s = this.sessions.get(id);
    return !!s && s.userId === userId && s.expiresAt.getTime() > Date.now();
  }
  async deleteSession(id: string) {
    this.sessions.delete(id);
  }
  async getAppearance(userId: string) {
    return this.appearance.get(userId) ?? DEFAULT_APPEARANCE;
  }
  async setAppearance(userId: string, a: Appearance) {
    this.appearance.set(userId, a);
  }
  async getStats(userId: string) {
    return this.stats.get(userId) ?? emptyStats();
  }
  async recordMatch(m: MatchRecordInput) {
    const id = randomUUID();
    this.matches.push({ ...m, id });
    for (const p of m.players) {
      if (!p.userId || !this.users.has(p.userId)) continue;
      const s = this.stats.get(p.userId) ?? emptyStats();
      applyStats(s, p, m.winningTeam);
      this.stats.set(p.userId, s);
    }
    return id;
  }
  async createReport(r: ReportInput) {
    this.reports.push(r);
  }
  async health() {
    return true;
  }
  async close() {}
}

function applyStats(s: ProfileStats, p: MatchRecordInput['players'][number], _winner: Team) {
  s.gamesPlayed++;
  if (p.won) {
    s.wins++;
    if (p.role === 'manager') s.managerWins++;
    else s.employeeWins++;
  } else s.losses++;
  s.tasksCompleted += p.tasksCompleted;
  s.eliminations += p.eliminations;
}

export class PrismaStore implements Store {
  readonly kind = 'postgres' as const;
  // Typed loosely so the server still compiles before `prisma generate` runs.
  constructor(private db: any) {}

  static async connect(url: string): Promise<PrismaStore> {
    const { PrismaClient } = await import('@prisma/client');
    const db = new PrismaClient({ datasources: { db: { url } } });
    await db.$connect();
    return new PrismaStore(db);
  }

  async findUserByName(username: string) {
    return this.db.user.findUnique({ where: { usernameKey: username.toLowerCase() } });
  }
  async findUserById(id: string) {
    return this.db.user.findUnique({ where: { id } });
  }
  async createUser(username: string, passwordHash: string, a: Appearance) {
    try {
      return await this.db.user.create({
        data: {
          username,
          usernameKey: username.toLowerCase(),
          passwordHash,
          profile: {
            create: {
              color: a.color,
              shirt: a.shirt,
              skin: a.skin,
              hairstyle: a.hair,
              hairColor: a.hairColor,
              outfit: a.outfit,
              accessory: a.accessory,
            },
          },
          stats: { create: {} },
        },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') throw new Error('USERNAME_TAKEN');
      throw e;
    }
  }
  async deleteUser(id: string) {
    await this.db.user.delete({ where: { id } });
  }
  async renameUser(id: string, username: string) {
    try {
      await this.db.user.update({ where: { id }, data: { username, usernameKey: username.toLowerCase() } });
    } catch (e: any) {
      if (e?.code === 'P2002') throw new Error('USERNAME_TAKEN');
      throw e;
    }
  }
  async createSession(id: string, userId: string, expiresAt: Date) {
    await this.db.session.create({ data: { id, userId, expiresAt } });
  }
  async sessionValid(id: string, userId: string) {
    const s = await this.db.session.findUnique({ where: { id } });
    return !!s && s.userId === userId && s.expiresAt.getTime() > Date.now();
  }
  async deleteSession(id: string) {
    await this.db.session.deleteMany({ where: { id } });
  }
  async getAppearance(userId: string): Promise<Appearance> {
    const p = await this.db.profile.findUnique({ where: { userId } });
    if (!p) return DEFAULT_APPEARANCE;
    return {
      color: p.color,
      shirt: p.shirt,
      skin: p.skin,
      hair: p.hairstyle,
      hairColor: p.hairColor,
      outfit: p.outfit,
      accessory: p.accessory,
    } as Appearance;
  }
  async setAppearance(userId: string, a: Appearance) {
    const data = {
      color: a.color,
      shirt: a.shirt,
      skin: a.skin,
      hairstyle: a.hair,
      hairColor: a.hairColor,
      outfit: a.outfit,
      accessory: a.accessory,
    };
    await this.db.profile.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  }
  async getStats(userId: string): Promise<ProfileStats> {
    const s = await this.db.playerStats.findUnique({ where: { userId } });
    return s ?? emptyStats();
  }
  async recordMatch(m: MatchRecordInput) {
    const durationMs = m.endedAt.getTime() - m.startedAt.getTime();
    return this.db.$transaction(async (tx: any) => {
      const userIds = m.players.map((p) => p.userId).filter(Boolean) as string[];
      const existing = new Set(
        (await tx.user.findMany({ where: { id: { in: userIds } }, select: { id: true } })).map((u: any) => u.id),
      );
      const match = await tx.match.create({
        data: {
          roomCode: m.roomCode,
          startedAt: m.startedAt,
          endedAt: m.endedAt,
          winningTeam: m.winningTeam,
          reason: m.reason,
          totalPlayers: m.players.length,
          durationMs,
          players: {
            create: m.players.map((p) => ({
              userId: p.userId && existing.has(p.userId) ? p.userId : null,
              displayName: p.displayName,
              role: p.role,
              won: p.won,
              tasksCompleted: p.tasksCompleted,
              eliminations: p.eliminations,
            })),
          },
        },
      });
      for (const p of m.players) {
        if (!p.userId || !existing.has(p.userId)) continue;
        await tx.playerStats.upsert({
          where: { userId: p.userId },
          create: {
            userId: p.userId,
            gamesPlayed: 1,
            wins: p.won ? 1 : 0,
            losses: p.won ? 0 : 1,
            employeeWins: p.won && p.role === 'employee' ? 1 : 0,
            managerWins: p.won && p.role === 'manager' ? 1 : 0,
            tasksCompleted: p.tasksCompleted,
            eliminations: p.eliminations,
          },
          update: {
            gamesPlayed: { increment: 1 },
            wins: { increment: p.won ? 1 : 0 },
            losses: { increment: p.won ? 0 : 1 },
            employeeWins: { increment: p.won && p.role === 'employee' ? 1 : 0 },
            managerWins: { increment: p.won && p.role === 'manager' ? 1 : 0 },
            tasksCompleted: { increment: p.tasksCompleted },
            eliminations: { increment: p.eliminations },
          },
        });
      }
      return match.id as string;
    });
  }
  async createReport(r: ReportInput) {
    await this.db.report.create({
      data: {
        reporterId: r.reporterUserId,
        reporterName: r.reporterName,
        reportedId: r.reportedId,
        reportedName: r.reportedName,
        roomCode: r.roomCode,
        category: r.category,
        note: r.note ?? null,
      },
    });
  }
  async health() {
    try {
      await this.db.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
  async close() {
    await this.db.$disconnect();
  }
}

export async function createStore(databaseUrl: string | null, log: (m: string) => void): Promise<Store> {
  if (!databaseUrl) {
    log('DATABASE_URL not set — using in-memory store (accounts reset on restart).');
    return new MemoryStore();
  }
  try {
    const s = await PrismaStore.connect(databaseUrl);
    log('Connected to PostgreSQL.');
    return s;
  } catch (e) {
    log(`Could not connect to PostgreSQL (${(e as Error).message}). Falling back to in-memory store.`);
    return new MemoryStore();
  }
}
