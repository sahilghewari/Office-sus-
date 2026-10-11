// Runs the multiplayer server and the Vite dev server together.
import { spawn } from 'node:child_process';

const procs = [
  ['server', ['run', 'dev', '-w', '@corp/server']],
  ['web', ['run', 'dev', '-w', '@corp/web']],
].map(([name, args]) => {
  const p = spawn('npm', args, { stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
  const tag = name === 'server' ? '\x1b[35m[server]\x1b[0m' : '\x1b[36m[web]\x1b[0m';
  const out = (d) => process.stdout.write(d.toString().split('\n').filter(Boolean).map((l) => `${tag} ${l}\n`).join(''));
  p.stdout.on('data', out);
  p.stderr.on('data', out);
  p.on('exit', (code) => {
    console.log(`${tag} exited with ${code}`);
    procs.forEach((q) => q.kill());
    process.exit(code ?? 0);
  });
  return p;
});
process.on('SIGINT', () => procs.forEach((p) => p.kill('SIGINT')));
