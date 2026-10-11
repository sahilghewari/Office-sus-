import { expect, test } from '@playwright/test';
import { STATION_BY_ID } from '@corp/shared';
import { Bot, sleep } from '../support/bot';
import { SERVER, createRoom, onboard, sendRaw, solveOpenTask, store } from './helpers';

/**
 * Full match through a REAL browser (the host) plus three protocol bots.
 * The browser player completes a task through the minigame UI, gets
 * eliminated, sees the meeting, chats, and watches the end screen.
 */
test('landing → room → 4-player match → task → meeting → vote → game over → rematch', async ({ page }) => {
  await onboard(page, 'Browser Bea');
  const code = await createRoom(page);
  await expect(page.getByTestId('lobby-panel')).toBeVisible();

  // three bots join by code
  const bots = [new Bot(SERVER, 'Priya', 3), new Bot(SERVER, 'Marcus', 4), new Bot(SERVER, 'Chen', 5)];
  for (const b of bots) await b.connect(code);
  await expect(page.getByTestId('player-list')).toContainText('Chen');
  for (const b of bots) b.send({ t: 'ready', ready: true });

  // host config: 1 task each, short meetings, Chen is the manager (test hook)
  await sendRaw(page, { t: 'settings', settings: { tasksPerPlayer: 1, discussionTime: 5, votingTime: 20 } });
  await sendRaw(page, { t: 'test', cmd: 'forceManagers', args: { ids: [bots[2].id] } });
  await expect(page.getByTestId('start-game')).toBeEnabled();
  await page.getByTestId('start-game').click();

  // private role reveal
  await expect(page.getByTestId('role-title')).toHaveText('YOU ARE AN EMPLOYEE.');
  await expect(page.getByTestId('task-list')).toBeVisible({ timeout: 10_000 });
  expect(await store(page, 'g.state.players.filter(p => p.role === "manager").length')).toBe(0);

  // browser player does its task through the real minigame UI
  const stationId = await store<string>(page, 'g.state.you.tasks[0].stationId');
  const st = STATION_BY_ID[stationId];
  await sendRaw(page, { t: 'test', cmd: 'teleport', args: { x: st.x, y: st.y } });
  await page.waitForTimeout(400);
  await page.keyboard.press('KeyE');
  await solveOpenTask(page);
  await expect(page.getByTestId('task-success')).toBeVisible();
  await expect.poll(() => store(page, 'g.state.progress.done')).toBe(1);

  // the manager eliminates Priya next to the browser player
  const [priya, marcus, chen] = bots;
  await sendRaw(page, { t: 'test', cmd: 'teleport', args: { x: 14.2, y: 12.3 } });
  chen.send({ t: 'test', cmd: 'fastForward', args: { ms: 60_000 } });
  chen.send({ t: 'test', cmd: 'teleport', args: { x: 14.6, y: 11.6 } });
  priya.send({ t: 'test', cmd: 'teleport', args: { x: 15.2, y: 11.6 } });
  await sleep(300);
  chen.send({ t: 'kill', target: priya.id });
  await priya.expectMsg((m) => m.t === 'youDied');
  // the incident is visible to the browser → report button lights up → press R
  await expect(page.getByTestId('report-btn')).toBeEnabled({ timeout: 5000 });
  await page.keyboard.press('KeyR');
  await expect(page.getByTestId('meeting-intro')).toBeVisible();
  await expect(page.getByTestId('meeting-room')).toBeVisible({ timeout: 8000 });

  // real-time chat
  await page.getByTestId('chat-input').fill('Chen was right next to the body!');
  await page.getByTestId('chat-input').press('Enter');
  await marcus.expectMsg((m) => m.t === 'chat' && m.msg.text.includes('right next to the body'));
  marcus.send({ t: 'chat', text: 'Agreed. Voting Chen.' });
  await expect(page.getByTestId('chat-log')).toContainText('Agreed. Voting Chen.');

  // voting
  await expect(page.getByText('VOTING', { exact: true })).toBeVisible({ timeout: 10_000 });
  await page.getByTestId('vote-card-Chen').click();
  await page.getByTestId('confirm-vote').click();
  marcus.send({ t: 'vote', target: chen.id });
  chen.send({ t: 'vote', target: marcus.id });
  await expect(page.getByTestId('ejection-title')).toHaveText('CHEN HAS BEEN TERMINATED.', {
    timeout: 10_000,
  });
  await expect(page.getByText('They were a Toxic Manager.')).toBeVisible();

  // employees win
  await expect(page.getByTestId('winner-headline')).toHaveText('THE EMPLOYEES SURVIVED MONDAY!', {
    timeout: 15_000,
  });
  await expect(page.getByTestId('final-roles')).toContainText('Toxic Manager');

  // rematch: back to the lobby with clean state
  await page.getByTestId('play-again').click();
  await expect(page.getByTestId('lobby-panel')).toBeVisible({ timeout: 5000 });
  expect(await store(page, 'g.state.you.tasks.length')).toBe(0);
  bots.forEach((b) => b.close());
});

test('refresh mid-lobby reconnects as the same player', async ({ page }) => {
  await onboard(page, 'Refresh Rae');
  const code = await createRoom(page);
  const id = await store<string>(page, 'g.state.you.id');
  await page.reload();
  await expect(page.getByTestId('room-code')).toHaveText(code);
  expect(await store<string>(page, 'g.state.you.id')).toBe(id);
  expect(await store<number>(page, 'g.state.players.length')).toBe(1);
});

test('joining with an invalid code shows a friendly error', async ({ page }) => {
  await onboard(page, 'Lost Lou');
  await page.getByTestId('join-code').fill('ZZZZZZ');
  await page.getByTestId('join-submit').click();
  await expect(page.getByRole('alert')).toContainText(/No office found/);
});
