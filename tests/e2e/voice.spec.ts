import { expect, test } from '@playwright/test';
import { RoomServiceClient } from 'livekit-server-sdk';
import { Bot, sleep } from '../support/bot';
import { SERVER, createRoom, onboard, sendRaw, store } from './helpers';

/**
 * Proximity voice through a real LiveKit server (fake microphones).
 * Verifies: both browsers connect, server-computed distance gains, and that an
 * eliminated player is removed from the living room and moved to the ghost room.
 */
const LK_URL = process.env.E2E_LIVEKIT_URL ?? 'ws://127.0.0.1:7880';
const lk = new RoomServiceClient(
  LK_URL.replace(/^ws/, 'http'),
  process.env.E2E_LIVEKIT_KEY ?? 'devkey',
  process.env.E2E_LIVEKIT_SECRET ?? 'secret',
);

test.skip(!!process.env.E2E_NO_VOICE, 'voice server not available');

test('proximity voice + ghost isolation enforced by the server', async ({ browser }) => {
  const ctxA = await browser.newContext({ permissions: ['microphone'] });
  const ctxB = await browser.newContext({ permissions: ['microphone'] });
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  await onboard(a, 'Voice Ana');
  const code = await createRoom(a);
  await onboard(b, 'Voice Ben');
  await b.getByTestId('join-code').fill(code);
  await b.getByTestId('join-submit').click();
  await expect(b.getByTestId('lobby-panel')).toBeVisible();

  for (const p of [a, b]) await p.getByTestId('voice-join').click();
  await expect.poll(() => store(a, 'g.voice.status'), { timeout: 20_000 }).toBe('on');
  await expect.poll(() => store(b, 'g.voice.status'), { timeout: 20_000 }).toBe('on');
  const main = `${code}-main`;
  await expect.poll(async () => (await lk.listParticipants(main)).length, { timeout: 15_000 }).toBe(2);

  // fill to 4 with bots and start (Ben is forced to be the manager)
  const bots = [new Bot(SERVER, 'Bot One', 5), new Bot(SERVER, 'Bot Two', 6)];
  for (const x of bots) {
    await x.connect(code);
    x.send({ t: 'ready', ready: true });
  }
  await b.getByTestId('ready-toggle').click();
  const benId = await store<string>(b, 'g.state.you.id');
  const anaId = await store<string>(a, 'g.state.you.id');
  await sendRaw(a, { t: 'test', cmd: 'forceManagers', args: { ids: [benId] } });
  await a.getByTestId('start-game').click();
  await expect(a.getByTestId('task-list')).toBeVisible({ timeout: 15_000 });

  // proximity: far apart → silent, close → audible (gains computed by the server)
  await sendRaw(a, { t: 'test', cmd: 'teleport', args: { x: 5, y: 11.6 } });
  await sendRaw(b, { t: 'test', cmd: 'teleport', args: { x: 40, y: 11.6 } });
  await expect
    .poll(() => a.evaluate((id) => (window as any).__voiceGains?.[id] ?? null, benId), { timeout: 5000 })
    .toBe(0);
  await sendRaw(b, { t: 'test', cmd: 'teleport', args: { x: 6, y: 11.6 } });
  await expect
    .poll(() => a.evaluate((id) => (window as any).__voiceGains?.[id] ?? null, benId), { timeout: 5000 })
    .toBe(1);

  // Ben (manager) eliminates Ana → Ana is kicked from the living room by the server
  await sendRaw(b, { t: 'test', cmd: 'fastForward', args: { ms: 60_000 } });
  await sleep(200);
  await sendRaw(b, { t: 'kill', target: anaId });
  await expect.poll(() => store(a, 'g.state.you.alive'), { timeout: 5000 }).toBe(false);
  await expect
    .poll(async () => (await lk.listParticipants(main)).map((p) => p.identity), { timeout: 15_000 })
    .not.toContain(anaId);
  await expect
    .poll(async () => (await lk.listParticipants(`${code}-ghost`)).map((p) => p.identity), {
      timeout: 20_000,
    })
    .toContain(anaId);
  await expect.poll(() => store(a, 'g.voice.mode'), { timeout: 10_000 }).toBe('ghost');
  bots.forEach((x) => x.close());
  await ctxA.close();
  await ctxB.close();
});
