import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { loadConfig, type Config } from './config';
import { TokenService } from './authentication/tokens';
import { createStore, MemoryStore, type Store } from './database/store';
import { createDirectory, type RoomDirectory } from './matchmaking/directory';
import { createVoice, type VoiceService } from './voice/livekit';
import { RoomManager } from './rooms/RoomManager';
import { attachGateway } from './ws/gateway';
import { registerRoutes } from './api/routes';
import { describeProxyTrust, resolveClientIp } from './security/clientIp';

export interface GameServer {
  config: Config;
  manager: RoomManager;
  store: Store;
  voice: VoiceService;
  directory: RoomDirectory;
  tokens: TokenService;
  url: string;
  port: number;
  close(): Promise<void>;
}

/** IPv4 addresses other devices on the network can use to reach this machine. */
export function lanAddresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(networkInterfaces()))
    for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.')) out.push(a.address);
  return out;
}

export interface CreateOptions {
  config?: Partial<Config>;
  store?: Store;
  voice?: VoiceService;
  manualTick?: boolean;
  quiet?: boolean;
}

export async function createGameServer(opts: CreateOptions = {}): Promise<GameServer> {
  const config = loadConfig(opts.config);
  const log = opts.quiet ? () => {} : (m: string) => console.log(`[corp-sus] ${m}`);
  const store = opts.store ?? (await createStore(config.databaseUrl, log));
  const directory = await createDirectory(config.redisUrl, log);
  const voice = opts.voice ?? (await createVoice(config.livekit, log));
  const tokens = new TokenService(config.sessionSecret);
  const manager = new RoomManager({
    directory,
    store,
    voice,
    instanceUrl: config.instanceUrl,
    testHooks: config.testHooks,
    log,
    manualTick: opts.manualTick,
  });
  if (config.testHooks) log('⚠ Test hooks are ENABLED. Never use this configuration in production.');

  // Fastify's own proxy handling stays off: every per-IP limit (HTTP and WebSocket) keys on
  // resolveClientIp so the two can never disagree about who a client is.
  const app = Fastify({ logger: false, bodyLimit: 16 * 1024, trustProxy: false });
  const ipOf = (req: { raw: Parameters<typeof resolveClientIp>[0] }) => resolveClientIp(req.raw, config.trustProxy);
  await app.register(cors, { origin: config.production ? config.publicOrigin : true, credentials: false });
  await app.register(rateLimit, {
    global: true,
    max: 300 * config.rateLimitScale,
    timeWindow: '1 minute',
    keyGenerator: ipOf,
  });
  log(`Client IPs from: ${describeProxyTrust(config.trustProxy)}`);
  if (config.rateLimitScale > 1) log(`⚠ Rate limits scaled ×${config.rateLimitScale} (load testing).`);
  app.addHook('onSend', async (_req, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    reply.header('X-Frame-Options', 'DENY');
    return payload;
  });
  registerRoutes(app, {
    tokens,
    store,
    manager,
    voice,
    directory,
    startedAt: Date.now(),
    rateLimitScale: config.rateLimitScale,
    lanUrls: config.lanMode ? lanAddresses().map((ip) => `http://${ip}:${config.port}`) : [],
  });

  if (config.serveWeb) {
    const here = dirname(fileURLToPath(import.meta.url));
    const candidates = [
      resolve(here, '../../web/dist'),
      resolve(here, '../web'),
      resolve(process.cwd(), 'apps/web/dist'),
      resolve(process.cwd(), 'web'),
    ];
    const root = candidates.find((c) => existsSync(resolve(c, 'index.html')));
    if (root) {
      await app.register(fastifyStatic, {
        root,
        prefix: '/',
        maxAge: '1h',
        // @fastify/static ≥10 passes a Fastify-style reply here; older versions a raw ServerResponse.
        setHeaders: (res: any, path: string) => {
          if (!path.endsWith('index.html')) return;
          if (typeof res.setHeader === 'function') res.setHeader('Cache-Control', 'no-cache');
          else if (typeof res.header === 'function') res.header('Cache-Control', 'no-cache');
        },
      });
      app.setNotFoundHandler((req, reply) => {
        if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'Not found' });
        return reply.sendFile('index.html');
      });
      log(`Serving web client from ${root}`);
    } else log('SERVE_WEB=true but no built web client was found (run `npm run build`).');
  }

  await app.ready();
  attachGateway({
    server: app.server,
    manager,
    tokens,
    store,
    allowedOrigins: config.publicOrigin,
    enforceOrigin: config.production,
    trustProxy: config.trustProxy,
    log,
    rateLimitScale: config.rateLimitScale,
  });
  await app.listen({ port: config.port, host: config.host });
  const addr = app.server.address();
  const port = typeof addr === 'object' && addr ? addr.port : config.port;
  log(
    `Listening on http://localhost:${port} (ws path /ws) — store=${store.kind}, directory=${directory.kind}, voice=${voice.enabled}`,
  );

  return {
    config,
    manager,
    store,
    voice,
    directory,
    tokens,
    port,
    url: `http://127.0.0.1:${port}`,
    async close() {
      manager.shutdown();
      await app.close();
      await directory.close();
      if (!(store instanceof MemoryStore)) await store.close();
    },
  };
}
