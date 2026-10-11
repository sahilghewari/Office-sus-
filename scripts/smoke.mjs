/* global document */
// Production smoke test: node scripts/smoke.mjs <baseUrl> [screenshot.png]
import { chromium } from '@playwright/test';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1366, height: 820 } });
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await p.goto((process.argv[2] ?? 'http://localhost:2567') + '/?forceLoop=1');
await p.getByTestId('start-working').click();
await p.getByTestId('name-input').fill('Prod Pat');
await p.getByTestId('save-profile').click();
await p.getByTestId('create-room').click();
await p.getByTestId('room-code').waitFor();
const code = await p.getByTestId('room-code').textContent();
await p.waitForTimeout(2500);
await p.screenshot({ path: process.argv[3] ?? 'smoke.png' });
console.log(JSON.stringify({ code, errors, gl: await p.evaluate(() => !!document.querySelector('canvas')) }));
await b.close();
