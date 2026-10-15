// Host a Corporate Sus office on your local network (LAN party mode).
//   npm run host            → builds if needed, then serves on port 2567
//   npm run host -- 3000    → custom port
//   npm run host -- --rebuild
// Friends on the same Wi-Fi open the printed http://<your-ip>:<port> address. No install needed for them.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const port = Number(args.find((a) => /^\d+$/.test(a)) ?? process.env.PORT ?? 2567);
const serverBundle = resolve(root, 'apps/server/dist/index.js');
const webIndex = resolve(root, 'apps/web/dist/index.html');

if (args.includes('--rebuild') || !existsSync(serverBundle) || !existsSync(webIndex)) {
  console.log('Building Corporate Sus (first run takes a minute)…');
  const r = spawnSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

const ips = [];
for (const list of Object.values(networkInterfaces()))
  for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.')) ips.push(a.address);

const child = spawn(process.execPath, [serverBundle], {
  cwd: resolve(root, 'apps/server'),
  stdio: ['ignore', 'pipe', 'inherit'],
  env: {
    ...process.env,
    NODE_ENV: 'production',
    SERVE_WEB: 'true',
    LAN_MODE: 'true',
    // Friends connect directly, so proxy headers are client-controlled: never trust them here.
    TRUST_PROXY: 'false',
    HOST: '0.0.0.0',
    PORT: String(port),
    PUBLIC_ORIGIN: process.env.PUBLIC_ORIGIN ?? `http://localhost:${port}`,
    SESSION_SECRET: process.env.SESSION_SECRET ?? randomBytes(32).toString('hex'),
  },
});

let announced = false;
child.stdout.on('data', (d) => {
  process.stdout.write(d);
  if (!announced && d.toString().includes('Listening on')) {
    announced = true;
    const line = '─'.repeat(58);
    console.log(`\n${line}\n  🏢  CORPORATE SUS is open for business!\n`);
    console.log(`  You:      http://localhost:${port}`);
    if (ips.length) for (const ip of ips) console.log(`  Friends:  http://${ip}:${port}   (same Wi-Fi / LAN)`);
    else console.log('  Friends:  no network connection found — connect to Wi-Fi first.');
    console.log(`\n  If friends can't connect, allow Node.js through your firewall.`);
    console.log(`  Press Ctrl+C to close the office.\n${line}\n`);
  }
});
child.on('exit', (code) => process.exit(code ?? 0));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
