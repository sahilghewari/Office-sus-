import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  AppearanceSchema,
  DEFAULT_APPEARANCE,
  NameSchema,
  PROTOCOL_VERSION,
  ROOM_CODE_RE,
} from '@corp/shared';
import { hashPassword, validatePasswordStrength, verifyPassword } from '../authentication/password';
import { newSessionSecret, type TokenPayload, type TokenService } from '../authentication/tokens';
import type { Store } from '../database/store';
import type { RoomManager } from '../rooms/RoomManager';
import type { VoiceService } from '../voice/livekit';
import type { RoomDirectory } from '../matchmaking/directory';

export interface ApiDeps {
  tokens: TokenService;
  store: Store;
  manager: RoomManager;
  voice: VoiceService;
  directory: RoomDirectory;
  startedAt: number;
  rateLimitScale?: number;
}

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

const Credentials = z.object({ username: NameSchema, password: z.string().min(1).max(128) });

export function registerRoutes(app: FastifyInstance, d: ApiDeps) {
  const authOf = (req: FastifyRequest): TokenPayload | null => {
    const h = req.headers.authorization;
    if (!h || !h.startsWith('Bearer ')) return null;
    return d.tokens.verify(h.slice(7));
  };
  const requireUser = async (req: FastifyRequest) => {
    const t = authOf(req);
    if (!t || t.kind !== 'user' || !t.sid) return null;
    const userId = t.sub.slice(2);
    if (!(await d.store.sessionValid(t.sid, userId))) return null;
    return { userId, sid: t.sid };
  };
  const issueUserToken = async (userId: string) => {
    const { secret, id } = newSessionSecret();
    void secret;
    const exp = Date.now() + SESSION_TTL_MS;
    await d.store.createSession(id, userId, new Date(exp));
    return d.tokens.sign({ sub: `u_${userId}`, kind: 'user', sid: id, exp });
  };
  const userView = async (userId: string) => {
    const u = await d.store.findUserById(userId);
    if (!u) return null;
    return {
      id: u.id,
      username: u.username,
      createdAt: u.createdAt,
      appearance: await d.store.getAppearance(userId),
      stats: await d.store.getStats(userId),
    };
  };
  const k = d.rateLimitScale ?? 1;
  const lim = (max: number) => ({ config: { rateLimit: { max: max * k, timeWindow: '1 minute' } } });
  const authLimit = lim(10);

  app.get('/api/health', async () => {
    const totals = d.manager.totals();
    const s = d.manager.stats;
    return {
      ok: true,
      uptimeS: Math.round((Date.now() - d.startedAt) / 1000),
      ...totals,
      db: d.store.kind,
      dbHealthy: await d.store.health(),
      directory: d.directory.kind,
      voice: d.voice.enabled,
      tick: {
        count: s.ticks,
        avgMs: s.ticks ? +(s.tickMsTotal / s.ticks).toFixed(3) : 0,
        maxMs: +s.tickMsMax.toFixed(2),
      },
      memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    };
  });

  app.get('/api/config', async () => ({
    protocol: PROTOCOL_VERSION,
    voice: d.voice.enabled,
    accounts: true,
    persistentAccounts: d.store.kind === 'postgres',
  }));

  app.post('/api/auth/guest', lim(30), async () => ({
    token: d.tokens.guest(),
    kind: 'guest',
  }));

  app.post('/api/auth/register', authLimit, async (req, reply) => {
    const body = Credentials.extend({ appearance: AppearanceSchema.optional() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Usernames are 2–16 letters/numbers.' });
    const weak = validatePasswordStrength(body.data.password);
    if (weak) return reply.code(400).send({ error: weak });
    try {
      const u = await d.store.createUser(
        body.data.username,
        await hashPassword(body.data.password),
        body.data.appearance ?? DEFAULT_APPEARANCE,
      );
      return { token: await issueUserToken(u.id), user: await userView(u.id) };
    } catch (e) {
      if ((e as Error).message === 'USERNAME_TAKEN')
        return reply.code(409).send({ error: 'That username is taken.' });
      throw e;
    }
  });

  app.post('/api/auth/login', authLimit, async (req, reply) => {
    const body = Credentials.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Invalid username or password.' });
    const u = await d.store.findUserByName(body.data.username);
    // Always run a hash comparison to avoid user-enumeration timing differences.
    const ok = await verifyPassword(
      body.data.password,
      u?.passwordHash ??
        'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    );
    if (!u || !ok) return reply.code(401).send({ error: 'Invalid username or password.' });
    return { token: await issueUserToken(u.id), user: await userView(u.id) };
  });

  app.post('/api/auth/logout', async (req) => {
    const t = authOf(req);
    if (t?.kind === 'user' && t.sid) await d.store.deleteSession(t.sid);
    return { ok: true };
  });

  app.get('/api/me', async (req, reply) => {
    const u = await requireUser(req);
    if (!u) return reply.code(401).send({ error: 'Not logged in.' });
    return { user: await userView(u.userId) };
  });

  app.put('/api/me/appearance', async (req, reply) => {
    const u = await requireUser(req);
    if (!u) return reply.code(401).send({ error: 'Not logged in.' });
    const a = AppearanceSchema.safeParse((req.body as any)?.appearance);
    if (!a.success) return reply.code(400).send({ error: 'Invalid appearance.' });
    await d.store.setAppearance(u.userId, a.data);
    return { ok: true };
  });

  app.put('/api/me/username', authLimit, async (req, reply) => {
    const u = await requireUser(req);
    if (!u) return reply.code(401).send({ error: 'Not logged in.' });
    const n = NameSchema.safeParse((req.body as any)?.username);
    if (!n.success) return reply.code(400).send({ error: 'Invalid username.' });
    try {
      await d.store.renameUser(u.userId, n.data);
    } catch (e) {
      if ((e as Error).message === 'USERNAME_TAKEN')
        return reply.code(409).send({ error: 'That username is taken.' });
      throw e;
    }
    return { user: await userView(u.userId) };
  });

  // Account deletion (privacy): requires the password again.
  app.delete('/api/me', authLimit, async (req, reply) => {
    const u = await requireUser(req);
    if (!u) return reply.code(401).send({ error: 'Not logged in.' });
    const pw = (req.body as any)?.password;
    const rec = await d.store.findUserById(u.userId);
    if (!rec || typeof pw !== 'string' || !(await verifyPassword(pw, rec.passwordHash)))
      return reply.code(403).send({ error: 'Password incorrect.' });
    await d.store.deleteUser(u.userId);
    return { ok: true };
  });

  app.post('/api/rooms', lim(10), async (req, reply) => {
    if (!authOf(req)) return reply.code(401).send({ error: 'Session required.' });
    const isPublic = (req.body as any)?.isPublic === true;
    const room = await d.manager.createRoom(isPublic);
    return { code: room.code };
  });

  app.get<{ Params: { code: string } }>('/api/rooms/:code', lim(30), async (req, reply) => {
    const code = req.params.code.toUpperCase();
    if (!ROOM_CODE_RE.test(code)) return reply.code(404).send({ error: 'Invalid code.' });
    const local = d.manager.get(code);
    if (local)
      return {
        code,
        phase: local.phase,
        players: local.playerCount,
        capacity: local.settings.maxPlayers,
        instanceUrl: null,
      };
    const l = await d.directory.get(code);
    if (!l) return reply.code(404).send({ error: 'No office found with that code.' });
    return { code, phase: l.phase, players: l.players, capacity: l.capacity, instanceUrl: l.instanceUrl };
  });

  app.post('/api/matchmake', lim(20), async (req, reply) => {
    if (!authOf(req)) return reply.code(401).send({ error: 'Session required.' });
    return d.manager.quickMatch();
  });

  app.get('/api/public-rooms', async () => {
    const open = await d.directory.listPublicOpen();
    return {
      rooms: open.map((r) => ({ players: r.players, capacity: r.capacity })),
      waiting: open.reduce((a, r) => a + r.players, 0),
    };
  });
}
