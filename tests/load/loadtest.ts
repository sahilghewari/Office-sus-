/**
 * Load test: spawns a real game-server process, fills N rooms with 10 bots
 * each (real WebSocket clients sending 20 Hz movement), starts matches and
 * measures server CPU / memory, message rates, snapshot delay and failures.
 *
 *   npm run loadtest -- --rooms 10 --players 10 --seconds 30
 *
 * Results are printed and written to tests/load/results-<rooms>x<players>.json
 */
import { spawn, execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { STATIONS, pick, createRng } from '@corp/shared';
import { Bot, sleep } from '../support/bot';

const arg = (k: string, d: number) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? Number(process.argv[i + 1]) : d;
};
const ROOMS = arg('rooms', 10);
const PLAYERS = arg('players', 10);
const SECONDS = arg('seconds', 30);
const PORT = arg('port', 2700);
const BASE = `http://127.0.0.1:${PORT}`;

async function main() {
  const srv = spawn('npx', ['tsx', 'apps/server/src/index.ts'], {
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATABASE_URL: '', REDIS_URL: '', LIVEKIT_URL: '', ENABLE_TEST_HOOKS: 'true', NODE_ENV: 'development', RATE_LIMIT_SCALE: '1000' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverPid = 0;
  srv.stdout.on('data', () => {});
  srv.stderr.on('data', (d) => process.stderr.write(d));
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) break;
    } catch {}
    await sleep(500);
  }
  // the tsx wrapper spawns node; find the process actually listening
  serverPid = Number(execSync(`lsof -nP -iTCP:${PORT} -sTCP:LISTEN -t`).toString().trim().split('\n')[0]);
  console.log(`server pid ${serverPid} up on ${BASE}`);

  const bots: Bot[] = [];
  let failures = 0;
  const t0 = Date.now();
  for (let r = 0; r < ROOMS; r++) {
    const hostTok = await Bot.token(BASE);
    const code = await Bot.createRoom(BASE, hostTok);
    const roomBots: Bot[] = [];
    for (let p = 0; p < PLAYERS; p++) {
      const b = new Bot(BASE, `L${r}-${p}`, p);
      try {
        await b.connect(code, p === 0 ? hostTok : undefined);
        roomBots.push(b);
      } catch (e) {
        failures++;
        console.error(`connect failed: ${(e as Error).message}`);
      }
    }
    const [host] = roomBots;
    host.send({ t: 'settings', settings: { discussionTime: 15, votingTime: 15, tasksPerPlayer: 3 } });
    for (const b of roomBots.slice(1)) b.send({ t: 'ready', ready: true });
    await sleep(100);
    host.send({ t: 'start' });
    bots.push(...roomBots);
  }
  console.log(`connected ${bots.length} bots in ${ROOMS} rooms (${Date.now() - t0} ms, ${failures} failures)`);
  await sleep(9000); // STARTING + ROLE_REVEAL

  // behaviour: wander between random stations at 20 Hz (realistic input load)
  let running = true;
  bots.forEach((b, i) => {
    const rng = createRng(i + 1);
    void (async () => {
      while (running && !b.closed) {
        const st = pick(rng, STATIONS);
        await b.walkTo(st.x, st.y, 6000).catch(() => {});
      }
    })();
  });

  // measure
  const samples: { cpu: number; rssMb: number }[] = [];
  const delays: number[] = [];
  const startMsgs = bots.reduce((a, b) => a + b.received, 0);
  const startBytes = bots.reduce((a, b) => a + b.bytes, 0);
  for (const b of bots) b.snapDelays.length = 0;
  for (let s = 0; s < SECONDS; s++) {
    await sleep(1000);
    try {
      const [cpu, rss] = execSync(`ps -o %cpu=,rss= -p ${serverPid}`).toString().trim().split(/\s+/).map(Number);
      samples.push({ cpu, rssMb: Math.round(rss / 1024) });
    } catch {}
  }
  running = false;
  for (const b of bots) delays.push(...b.snapDelays);
  const msgs = bots.reduce((a, b) => a + b.received, 0) - startMsgs;
  const bytes = bots.reduce((a, b) => a + b.bytes, 0) - startBytes;
  const health = await (await fetch(`${BASE}/api/health`)).json();
  const disconnected = bots.filter((b) => b.closed).length;
  const phases = new Map<string, number>();
  for (const b of bots) phases.set(b.state?.phase ?? '?', (phases.get(b.state?.phase ?? '?') ?? 0) + 1);
  delays.sort((a, b) => a - b);
  const pct = (p: number) => delays[Math.min(delays.length - 1, Math.floor(delays.length * p))] ?? 0;
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const result = {
    config: { rooms: ROOMS, playersPerRoom: PLAYERS, seconds: SECONDS, totalClients: bots.length },
    machine: { platform: process.platform, arch: process.arch, node: process.version, cpus: (await import('node:os')).cpus().length },
    serverCpuPercent: { avg: +avg(samples.map((s) => s.cpu)).toFixed(1), max: Math.max(...samples.map((s) => s.cpu)) },
    serverRssMb: { avg: Math.round(avg(samples.map((s) => s.rssMb))), max: Math.max(...samples.map((s) => s.rssMb)) },
    tick: health.tick,
    messagesToClientsPerSec: Math.round(msgs / SECONDS),
    kbPerSecPerClient: +(bytes / SECONDS / 1024 / bots.length).toFixed(1),
    snapshotDelayMs: { p50: pct(0.5), p95: pct(0.95), p99: pct(0.99) },
    connectFailures: failures,
    droppedConnections: disconnected,
    phases: Object.fromEntries(phases),
  };
  console.log(JSON.stringify(result, null, 2));
  writeFileSync(`tests/load/results-${ROOMS}x${PLAYERS}.json`, JSON.stringify(result, null, 2));
  bots.forEach((b) => b.close());
  srv.kill('SIGTERM');
  try {
    process.kill(serverPid, 'SIGTERM');
  } catch {}
  process.exit(0);
}

void main();
