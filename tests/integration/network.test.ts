import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { DEFAULT_APPEARANCE, PROTOCOL_VERSION } from '@corp/shared';
import { createGameServer, type GameServer } from '../../apps/server/src/app';
import { MemoryStore } from '../../apps/server/src/database/store';
import { Bot, sleep } from '../support/bot';

let server: GameServer;
let base: string;

beforeAll(async () => {
  server = await createGameServer({
    config: { port: 0, host: '127.0.0.1', testHooks: true, databaseUrl: null, redisUrl: null, livekit: null },
    store: new MemoryStore(),
    quiet: true,
  });
  base = server.url;
});
afterAll(async () => {
  await server.close();
});

const post = (path: string, body: unknown, token?: string) =>
  fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });

async function lobby(n: number, opts: { managers?: number[]; tasks?: number } = {}) {
  const hostTok = await Bot.token(base);
  const code = await Bot.createRoom(base, hostTok);
  const bots: Bot[] = [];
  bots.push(await new Bot(base, 'Host', 0).connect(code, hostTok));
  for (let i = 1; i < n; i++) bots.push(await new Bot(base, `Bot${i}`, i).connect(code));
  const [host] = bots;
  host.send({ t: 'settings', settings: { tasksPerPlayer: opts.tasks ?? 1, discussionTime: 0, votingTime: 15 } });
  if (opts.managers) host.send({ t: 'test', cmd: 'forceManagers', args: { ids: opts.managers.map((i) => bots[i].id) } });
  for (const b of bots.slice(1)) b.send({ t: 'ready', ready: true });
  await sleep(200);
  return { code, bots, host };
}

async function start(bots: Bot[]) {
  bots[0].send({ t: 'start' });
  await Promise.all(bots.map((b) => b.waitPhase('ACTIVE', 15_000)));
}

describe('HTTP API', () => {
  it('health + config', async () => {
    const h = await (await fetch(base + '/api/health')).json();
    expect(h.ok).toBe(true);
    const c = await (await fetch(base + '/api/config')).json();
    expect(c.protocol).toBe(PROTOCOL_VERSION);
  });

  it('room creation requires a session; unknown codes 404', async () => {
    expect((await post('/api/rooms', {})).status).toBe(401);
    expect((await fetch(base + '/api/rooms/ZZZZZZ')).status).toBe(404);
    expect((await fetch(base + '/api/rooms/not-a-code')).status).toBe(404);
  });

  it('registration, login, profile, logout and deletion', async () => {
    const reg = await post('/api/auth/register', { username: 'KPI Kevin', password: 'synergy123', appearance: DEFAULT_APPEARANCE });
    expect(reg.status).toBe(200);
    const { token } = await reg.json();
    expect((await post('/api/auth/register', { username: 'kpi kevin', password: 'synergy123' })).status).toBe(409);
    expect((await post('/api/auth/register', { username: 'Weak', password: 'short' })).status).toBe(400);
    expect((await post('/api/auth/login', { username: 'KPI Kevin', password: 'wrong-pass1' })).status).toBe(401);
    const login = await post('/api/auth/login', { username: 'kpi kevin', password: 'synergy123' });
    expect(login.status).toBe(200);
    const t2 = (await login.json()).token;
    const me = await (await fetch(base + '/api/me', { headers: { Authorization: `Bearer ${t2}` } })).json();
    expect(me.user.username).toBe('KPI Kevin');
    expect(me.user.stats.gamesPlayed).toBe(0);
    // passwords are never stored in plaintext
    const rec = await server.store.findUserByName('KPI Kevin');
    expect(rec!.passwordHash).not.toContain('synergy123');
    expect(rec!.passwordHash.startsWith('scrypt$')).toBe(true);
    await post('/api/auth/logout', {}, t2);
    expect((await fetch(base + '/api/me', { headers: { Authorization: `Bearer ${t2}` } })).status).toBe(401);
    const del = await fetch(base + '/api/me', { method: 'DELETE', headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ password: 'synergy123' }) });
    expect(del.status).toBe(200);
    expect(await server.store.findUserByName('KPI Kevin')).toBeNull();
  });

  it('forged tokens are rejected', async () => {
    const tok = await Bot.token(base);
    const forged = tok.slice(0, -4) + (tok.endsWith('AAAA') ? 'BBBB' : 'AAAA');
    expect((await post('/api/rooms', {}, forged)).status).toBe(401);
  });
});

describe('WebSocket security', () => {
  const rawHello = async (msg: unknown) => {
    const ws = new WebSocket(base.replace('http', 'ws') + '/ws');
    await new Promise((r) => ws.once('open', r));
    const got = new Promise<any>((r) => ws.once('message', (d) => r(JSON.parse(d.toString()))));
    ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
    const m = await got;
    ws.close();
    return m;
  };
  it('rejects invalid tokens, codes, versions and garbage', async () => {
    const tok = await Bot.token(base);
    const code = await Bot.createRoom(base, tok);
    const hello = { t: 'hello', v: PROTOCOL_VERSION, token: tok, code, name: 'Eve', appearance: DEFAULT_APPEARANCE };
    expect((await rawHello({ ...hello, token: 'x'.repeat(40) })).code).toBe('AUTH');
    expect((await rawHello({ ...hello, code: 'ZZZZZZ' })).code).toBe('ROOM_NOT_FOUND');
    expect((await rawHello({ ...hello, v: 1 })).code).toBe('VERSION');
    expect((await rawHello('{not json')).code).toBe('BAD_MESSAGE');
    expect((await rawHello({ t: 'input', seq: 1, mx: 0, my: 0 })).code).toBe('NO_HELLO');
    expect((await rawHello({ ...hello, name: '<script>' })).code).toBe('BAD_MESSAGE');
  });
});

describe('multiplayer over real sockets', () => {
  it('two clients see each other move (synchronised positions)', async () => {
    const { bots } = await lobby(2);
    const [a, b] = bots;
    await sleep(200);
    const startX = b.snap!.p.find((p) => p.i === a.id)!.x;
    await a.walkTo(a.me[0] + 2, a.me[1]);
    await sleep(300);
    const seen = b.snap!.p.find((p) => p.i === a.id)!;
    expect(Math.abs(seen.x - startX)).toBeGreaterThan(1.5);
    expect(Math.abs(seen.x - a.me[0])).toBeLessThan(0.3);
    bots.forEach((x) => x.close());
  });

  it('complete 4-player match: tasks win for employees (bots walk + solve real puzzles)', async () => {
    const { bots } = await lobby(4, { managers: [3], tasks: 1 });
    await start(bots);
    const roles = bots.map((b) => b.state!.you.role);
    expect(roles).toEqual(['employee', 'employee', 'employee', 'manager']);
    // manager fakes its task (must not count)
    const fake = bots[3].doTask(bots[3].state!.you.tasks[0].stationId);
    const done = await Promise.all(bots.slice(0, 3).map((b) => b.doAllTasks()));
    await fake;
    expect(done).toEqual([1, 1, 1]);
    const over = await bots[0].waitPhase('GAME_OVER', 10_000);
    expect(over.gameOver!.winner).toBe('employees');
    expect(over.gameOver!.reason).toBe('tasks');
    expect(over.gameOver!.tasksCompleted).toBe(3);
    bots.forEach((x) => x.close());
  }, 120_000);

  it('elimination → report → chat → vote → termination → second match without stale state', async () => {
    const { bots, host } = await lobby(5, { managers: [4], tasks: 1 });
    await start(bots);
    const [a, b, c, d, m] = bots;
    m.send({ t: 'test', cmd: 'fastForward', args: { ms: 60_000 } });
    m.send({ t: 'test', cmd: 'teleport', args: { x: 20, y: 11.6 } });
    d.send({ t: 'test', cmd: 'teleport', args: { x: 20.7, y: 11.6 } });
    a.send({ t: 'test', cmd: 'teleport', args: { x: 22, y: 12.2 } });
    await sleep(150);
    m.send({ t: 'kill', target: d.id });
    const died = await d.expectMsg((x) => x.t === 'youDied');
    expect(died).toBeTruthy();
    const elim = await a.expectMsg((x) => x.t === 'elim', 2000);
    expect(elim).toBeTruthy();
    await sleep(150);
    const body = a.snap!.b[0];
    expect(body.victimId).toBe(d.id);
    // simultaneous reports: exactly one meeting
    a.send({ t: 'report', body: body.id });
    b.send({ t: 'report', body: body.id });
    await a.waitPhase('MEETING_INTRO');
    a.send({ t: 'chat', text: 'I saw Bot4 standing over the body.' });
    const heard = await c.expectMsg((x) => x.t === 'chat' && x.msg.text.includes('standing over'), 3000);
    expect(heard).toBeTruthy();
    // ghost chat never reaches the living
    d.send({ t: 'chat', text: 'GHOST SECRET' });
    await a.waitPhase('VOTING', 10_000);
    for (const v of [a, b, c]) v.send({ t: 'vote', target: m.id });
    m.send({ t: 'vote', target: a.id });
    d.send({ t: 'vote', target: a.id }); // ghost vote is rejected
    const results = await a.waitPhase('VOTE_RESULTS', 5000);
    expect(results.meeting!.results!.ejectedId).toBe(m.id);
    expect(results.meeting!.results!.counts[m.id]).toBe(3);
    expect(results.meeting!.results!.counts[a.id]).toBe(1);
    expect(a.msgs.some((x) => x.t === 'chat' && x.msg.text === 'GHOST SECRET')).toBe(false);
    expect(d.errors.some((e) => e.code === 'GHOST')).toBe(true);
    const over = await a.waitPhase('GAME_OVER', 12_000);
    expect(over.gameOver!.winner).toBe('employees');
    // back to lobby + second match
    host.send({ t: 'returnToLobby' });
    await a.waitPhase('WAITING', 5000);
    for (const x of bots.slice(1)) x.send({ t: 'ready', ready: true });
    await sleep(200);
    host.send({ t: 'start' });
    const s2 = await a.waitPhase('ROLE_REVEAL', 6000);
    expect(s2.progress.done).toBe(0);
    expect(s2.players.every((p) => !p.dead)).toBe(true);
    expect(s2.you.tasks.every((t) => !t.done)).toBe(true);
    bots.forEach((x) => x.close());
  }, 60_000);

  it('reconnect restores the same player; mid-match joiners spectate', async () => {
    const { bots, code } = await lobby(4, { managers: [1] });
    await start(bots);
    const victim = bots[2];
    const role = victim.state!.you.role;
    const tasks = JSON.stringify(victim.state!.you.tasks);
    victim.ws.terminate(); // network drop
    await sleep(400);
    expect(bots[0].state!.players.find((p) => p.id === victim.id)!.connected).toBe(false);
    // a different identity joining mid-match becomes a spectator without role info
    const spectator = await new Bot(base, 'Watcher', 7).connect(code);
    expect(spectator.state!.you.spectator).toBe(true);
    expect(spectator.state!.players.every((p) => p.role === undefined)).toBe(true);
    spectator.send({ t: 'emergency' });
    await sleep(100);
    expect(spectator.errors.length).toBeGreaterThan(0);
    // the same identity token restores the original player
    const back = await new Bot(base, victim.name, 2).connect(code, victim.token);
    expect(back.id).toBe(victim.id);
    expect(back.msgs.find((m) => m.t === 'welcome' && m.reconnected)).toBeTruthy();
    expect(back.state!.you.role).toBe(role);
    expect(JSON.stringify(back.state!.you.tasks)).toBe(tasks);
    await sleep(200);
    expect(bots[0].state!.players.find((p) => p.id === victim.id)!.connected).toBe(true);
    // a second connection with the same identity replaces the first (no duplicates)
    const dup = await new Bot(base, victim.name, 2).connect(code, victim.token);
    await sleep(200);
    expect(back.closed).toBe(true);
    expect(bots[0].state!.players.filter((p) => p.name === victim.name)).toHaveLength(1);
    [...bots, spectator, dup].forEach((x) => x.close());
  }, 30_000);

  it('quick match puts players into the same public lobby', async () => {
    const t1 = await Bot.token(base);
    const t2 = await Bot.token(base);
    const r1 = await (await post('/api/matchmake', {}, t1)).json();
    const a = await new Bot(base, 'Pub1', 1).connect(r1.code, t1);
    const r2 = await (await post('/api/matchmake', {}, t2)).json();
    expect(r2.code).toBe(r1.code);
    const b = await new Bot(base, 'Pub2', 2).connect(r2.code, t2);
    await sleep(100);
    expect(b.state!.players.length).toBe(2);
    expect(b.state!.isPublic).toBe(true);
    a.close();
    b.close();
  });

  it('survives message floods without breaking the room', async () => {
    const { bots } = await lobby(2);
    const [a, b] = bots;
    for (let i = 0; i < 2000; i++) a.send({ t: 'input', seq: i + 1, mx: 1, my: 0 });
    for (let i = 0; i < 50; i++) a.send({ t: 'chat', text: `spam ${i}` });
    await sleep(500);
    expect(b.closed).toBe(false);
    const h = await (await fetch(base + '/api/health')).json();
    expect(h.ok).toBe(true);
    bots.forEach((x) => x.close());
  });
  // must run last: it exhausts this IP's failed-join budget
  it('brute-forcing room codes is rate limited per IP', async () => {
    const tok = await Bot.token(base);
    let limited = false;
    for (let i = 0; i < 14 && !limited; i++) {
      try {
        await new Bot(base, 'Guesser', 1).connect('ZZZZZ' + 'ABCDEFGHJKMNPQ'[i], tok);
      } catch (e) {
        if ((e as Error).message.startsWith('RATE_LIMIT')) limited = true;
      }
    }
    expect(limited).toBe(true);
  });

});
