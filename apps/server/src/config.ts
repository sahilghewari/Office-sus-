import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** Minimal .env loader (no extra dependency). Real env vars always win. */
function loadDotEnv() {
  for (const p of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')]) {
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m || line.trim().startsWith('#')) continue;
      const [, k, raw] = m;
      if (process.env[k] === undefined) process.env[k] = raw.replace(/^['"]|['"]$/g, '');
    }
    break;
  }
}

export interface Config {
  port: number;
  host: string;
  production: boolean;
  publicOrigin: string[];
  sessionSecret: string;
  databaseUrl: string | null;
  redisUrl: string | null;
  instanceUrl: string | null;
  livekit: { url: string; apiKey: string; apiSecret: string } | null;
  serveWeb: boolean;
  testHooks: boolean;
  /** Multiplies per-IP connection/API limits (load testing from one machine). */
  rateLimitScale: number;
}

export function loadConfig(overrides: Partial<Config> = {}): Config {
  loadDotEnv();
  const env = process.env;
  const production = env.NODE_ENV === 'production';
  const secret = env.SESSION_SECRET ?? '';
  if (production && (secret.length < 32 || secret.startsWith('change-me'))) {
    throw new Error('SESSION_SECRET must be set to a random string of at least 32 characters in production.');
  }
  const testHooks = env.ENABLE_TEST_HOOKS === 'true';
  if (production && testHooks) throw new Error('ENABLE_TEST_HOOKS must not be enabled in production.');
  const lk =
    env.LIVEKIT_URL && env.LIVEKIT_API_KEY && env.LIVEKIT_API_SECRET
      ? { url: env.LIVEKIT_URL, apiKey: env.LIVEKIT_API_KEY, apiSecret: env.LIVEKIT_API_SECRET }
      : null;
  return {
    port: Number(env.PORT ?? 2567),
    host: env.HOST ?? '0.0.0.0',
    production,
    publicOrigin: (env.PUBLIC_ORIGIN ?? 'http://localhost:5173').split(',').map((s) => s.trim()),
    sessionSecret: secret || 'dev-only-insecure-secret-dev-only-insecure-secret',
    databaseUrl: env.DATABASE_URL || null,
    redisUrl: env.REDIS_URL || null,
    instanceUrl: env.INSTANCE_URL || null,
    livekit: lk,
    serveWeb: env.SERVE_WEB === 'true',
    testHooks,
    rateLimitScale: Math.max(1, Number(env.RATE_LIMIT_SCALE ?? 1) || 1),
    ...overrides,
  };
}
