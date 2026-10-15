import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { DEFAULT_APPEARANCE, PROTOCOL_VERSION } from '@corp/shared';
import { createGameServer, type GameServer } from '../../apps/server/src/app';
import { MemoryStore } from '../../apps/server/src/database/store';
import type { ProxyTrust } from '../../apps/server/src/security/clientIp';

/**
 * Per-IP limits must not be escapable by sending a fresh X-Forwarded-For with each request.
 * Each test gets its own server so the limiters start empty.
 */
let server: GameServer | null = null;
afterEach(async () => {
  await server?.close();
  server = null;
});

async function boot(trustProxy: ProxyTrust) {
  server = await createGameServer({
    config: { port: 0, host: '127.0.0.1', databaseUrl: null, redisUrl: null, livekit: null, trustProxy },
    store: new MemoryStore(),
    quiet: true,
  });
  return server.url;
}

const login = (base: string, xff: string) =>
  fetch(base + '/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': xff },
    body: JSON.stringify({ username: 'nobody', password: 'wrong-pass1' }),
  }).then((r) => r.status);

/** Sends a hello for a room that doesn't exist and returns the error code. */
async function badJoin(base: string, token: string, xff: string) {
  const ws = new WebSocket(base.replace('http', 'ws') + '/ws', { headers: { 'x-forwarded-for': xff } });
  await new Promise((r, j) => ws.once('open', r).once('error', j));
  const got = new Promise<any>((r) => ws.once('message', (d) => r(JSON.parse(d.toString()))));
  ws.send(
    JSON.stringify({
      t: 'hello',
      v: PROTOCOL_VERSION,
      token,
      code: 'ZZZZZZ',
      name: 'Eve',
      appearance: DEFAULT_APPEARANCE,
    }),
  );
  const m = await got;
  ws.close();
  return m.code as string;
}

const guestToken = async (base: string) =>
  (await (await fetch(base + '/api/auth/guest', { method: 'POST' })).json()).token as string;

describe('client IP resolution', () => {
  it('by default, forged X-Forwarded-For does not reset the HTTP auth limit', async () => {
    const base = await boot({ mode: 'none' });
    const statuses = [];
    for (let i = 0; i < 12; i++) statuses.push(await login(base, `10.9.0.${i}`));
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);
  });

  it('by default, forged X-Forwarded-For does not reset the failed room-join limit', async () => {
    const base = await boot({ mode: 'none' });
    const token = await guestToken(base);
    const codes = [];
    for (let i = 0; i < 12; i++) codes.push(await badJoin(base, token, `10.9.1.${i}`));
    expect(codes.slice(0, 10).every((c) => c === 'ROOM_NOT_FOUND')).toBe(true);
    expect(codes.slice(10)).toEqual(['RATE_LIMIT', 'RATE_LIMIT']);
  });

  it('with one trusted hop, only the proxy-appended entry counts (HTTP and WebSocket agree)', async () => {
    const base = await boot({ mode: 'hops', hops: 1 });
    // The client forges the left part; the "proxy" appends the same real address every time.
    const statuses = [];
    for (let i = 0; i < 11; i++) statuses.push(await login(base, `10.9.2.${i}, 203.0.113.50`));
    expect(statuses.at(-1)).toBe(429);
    // A different real client behind the same proxy has its own budget.
    expect(await login(base, '203.0.113.51')).toBe(401);

    const token = await guestToken(base);
    const codes = [];
    for (let i = 0; i < 11; i++) codes.push(await badJoin(base, token, `10.9.3.${i}, 203.0.113.60`));
    expect(codes.at(-1)).toBe('RATE_LIMIT');
    expect(await badJoin(base, token, '203.0.113.61')).toBe('ROOM_NOT_FOUND');
  });
});
