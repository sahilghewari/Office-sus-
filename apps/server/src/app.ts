import { existsSync } from 'node:fs';
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

  const app = Fastify({ logger: false, bodyLimit: 16 * 1024, trustProxy: true });
  await app.register(cors, { origin: config.production ? config.publicOrigin : true, credentials: false });
  await app.register(rateLimit, { global: true, max: 300 * config.rateLimitScale, timeWindow: '1 minute' });
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
        setHeaders: (res, path) => {
          if (path.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
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
