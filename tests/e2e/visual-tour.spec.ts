import { test } from '@playwright/test';
import { Bot, sleep } from '../support/bot';
import { SERVER, createRoom, onboard, sendRaw, store } from './helpers';

/**
 * Not an assertion test: captures screenshots of every major screen for
 * visual QA (run with VISUAL_TOUR=1). Output: test-results/tour/*.png
 */
test.skip(!process.env.VISUAL_TOUR, 'set VISUAL_TOUR=1 to capture the visual tour');

test('visual tour', async ({ page }) => {
  const shot = (n: string) => page.screenshot({ path: `test-results/tour/${n}.png` });
  await page.goto('/?forceLoop=1');
  await page.waitForTimeout(1500);
  await shot('01-landing');
  await onboard(page, 'Tour Guide');
  await shot('02-playhub');
  const code = await createRoom(page);
  const bots = [
    new Bot(SERVER, 'Priya', 3),
    new Bot(SERVER, 'Marcus', 4),
    new Bot(SERVER, 'Chen', 5),
    new Bot(SERVER, 'Olu', 7),
  ];
  for (const b of bots) await b.connect(code);
  for (const b of bots) b.send({ t: 'ready', ready: true });
  await sleep(800);
  await shot('03-lobby');
  await page.getByTestId('lobby-customize').click();
  await page.waitForTimeout(600);
  await shot('04-customize-modal');
  await page.keyboard.press('Escape');
  await page
    .getByRole('button', { name: 'Close' })
    .first()
    .click()
    .catch(() => {});
  await sendRaw(page, { t: 'settings', settings: { tasksPerPlayer: 3, discussionTime: 5, votingTime: 15 } });
  const myId = await store<string>(page, 'g.state.you.id');
  await sendRaw(page, { t: 'test', cmd: 'forceManagers', args: { ids: [myId] } });
  await page.getByTestId('start-game').click();
  await page.waitForTimeout(3600);
  await page.waitForTimeout(1600);
  await shot('05-role-reveal-manager');
  await page.waitForTimeout(4500);
  await shot('06-hud-manager');
  await sendRaw(page, { t: 'test', cmd: 'fastForward', args: { ms: 60_000 } });
  // tour a few rooms
  for (const [name, x, y] of [
    ['07-server-room', 5, 6],
    ['08-ceo-cabin', 25.5, 6.5],
    ['09-cafeteria', 32, 34],
    ['10-gaming', 44, 20],
    ['11-workspace', 12, 19.5],
    ['12-it-support', 15.5, 4],
  ] as const) {
    await sendRaw(page, { t: 'test', cmd: 'teleport', args: { x, y } });
    await page.waitForTimeout(900);
    await shot(name);
  }
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(300);
  await shot('13-sabotage-menu');
  await page.getByTestId('sabotage-power').click();
  await page.waitForTimeout(1200);
  await shot('14-power-cut');
  await page.keyboard.press('Tab');
  await page.waitForTimeout(500);
  await shot('15-map');
  await page.keyboard.press('Tab');
  // elimination next to a bot
  const victim = bots[0];
  await sendRaw(page, { t: 'test', cmd: 'teleport', args: { x: 20, y: 12.3 } });
  victim.send({ t: 'test', cmd: 'teleport', args: { x: 20.8, y: 12.3 } });
  await page.waitForTimeout(500);
  await page.keyboard.press('KeyQ');
  await page.waitForTimeout(700);
  await shot('16-elimination');
  await page.waitForTimeout(1500);
  await shot('17-incident');
  bots[1].send({ t: 'test', cmd: 'teleport', args: { x: 21, y: 12.4 } });
  await sleep(300);
  const body = bots[1].snap?.b[0];
  if (body) bots[1].send({ t: 'report', body: body.id });
  await page.waitForTimeout(800);
  await shot('18-meeting-intro');
  await page.waitForTimeout(3500);
  bots[1].send({ t: 'chat', text: 'Tour Guide was standing right there!' });
  bots[2].send({ t: 'chat', text: 'I was fixing the printer!' });
  await page.waitForTimeout(800);
  await shot('19-discussion');
  await page.waitForTimeout(5000);
  for (const b of bots.slice(1)) b.send({ t: 'vote', target: myId });
  await page.getByTestId('skip-vote').click();
  await page.waitForTimeout(2500);
  await shot('20-vote-results');
  await page.waitForTimeout(2200);
  await shot('21-ejection');
  await page.waitForTimeout(6500);
  await shot('22-game-over');
  bots.forEach((b) => b.close());
});
