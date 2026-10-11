import { expect, type Page } from '@playwright/test';
import { TASK_INFO, solveFromData, type TaskType } from '@corp/shared';

export const SERVER = 'http://localhost:2600';

/** Landing → customise → play hub, as a brand-new guest. */
export async function onboard(page: Page, name: string) {
  await page.goto('/?forceLoop=1');
  await page.getByTestId('start-working').click();
  await page.getByTestId('name-input').fill(name);
  await page.getByTestId('save-profile').click();
  await expect(page.getByTestId('create-room')).toBeVisible();
}

export async function createRoom(page: Page): Promise<string> {
  await page.getByTestId('create-room').click();
  const code = page.getByTestId('room-code');
  await expect(code).toHaveText(/^[A-Z0-9]{6}$/);
  return (await code.textContent())!.trim();
}

export async function store<T>(page: Page, fn: string): Promise<T> {
  return page.evaluate(
    `(() => { const g = window.__cs.useGame.getState(); return (${fn}); })()`,
  ) as Promise<T>;
}

/** Sends a raw protocol message through the page's live connection (dev/test only). */
export async function sendRaw(page: Page, msg: unknown) {
  await page.evaluate((m) => (window as any).__cs.getConnection().send(m), msg);
}

async function center(page: Page, testId: string) {
  const box = await page.getByTestId(testId).first().boundingBox();
  if (!box) throw new Error(`no element ${testId}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function drag(page: Page, fromId: string, toId: string, holdMs = 0) {
  const a = await center(page, fromId);
  const b = await center(page, toId);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 12 });
  if (holdMs) {
    const t = Date.now();
    while (Date.now() - t < holdMs) {
      await page.mouse.move(b.x + (Math.random() - 0.5) * 4, b.y + (Math.random() - 0.5) * 4);
      await page.waitForTimeout(100);
    }
  }
  await page.mouse.up();
}

/**
 * Plays whichever minigame is open by interacting with the real UI like a
 * human would (drags, clicks, typing). The answer is derived from the same
 * public data shown on screen.
 */
export async function solveOpenTask(page: Page, opts: { respectMinTime?: boolean } = {}) {
  await expect(page.getByTestId('task-overlay')).toBeVisible();
  await page.waitForTimeout(600); // let the pop-in animation settle before aiming drags
  const { type, data } = await store<{ type: TaskType; data: any }>(
    page,
    '({ type: g.task.taskType, data: g.task.data })',
  );
  // The server rejects impossibly fast completions; a scripted player waits like a human would.
  if (opts.respectMinTime !== false) await page.waitForTimeout(TASK_INFO[type].minMs);
  const ans: any = solveFromData(type, data);
  switch (type) {
    case 'wifi':
      for (const c of data.left as string[]) await drag(page, `cable-${c}`, `port-${c}`);
      break;
    case 'expense':
      for (const [id, cat] of Object.entries(ans)) {
        await page.getByTestId(`receipt-${id}`).click();
        await page.getByTestId(`bin-${cat}`).click();
      }
      await page.getByTestId('submit-expenses').click();
      break;
    case 'files':
      for (const [id, folder] of Object.entries(ans)) {
        await page.getByTestId(`file-${id}`).click();
        await page.getByTestId(`folder-${folder}`).click();
      }
      break;
    case 'emails':
      for (const [id, cat] of Object.entries(ans)) {
        await page.getByTestId(`email-item-${id}`).click();
        await page.getByTestId(`email-${cat}`).click();
      }
      break;
    case 'coffee':
      for (const [ing, n] of Object.entries(ans as Record<string, number>))
        for (let i = 0; i < n; i++) await page.getByTestId(`add-${ing}`).click();
      await page.getByTestId('brew').click();
      break;
    case 'printer':
      await page.getByTestId('printer-open').click();
      for (const j of data.jams as string[]) await page.getByTestId(`jam-${j}`).click();
      if (data.cartridge) await page.getByTestId(`cart-${data.cartridge}`).click();
      await page.getByTestId('printer-close').click();
      await page.getByTestId('printer-restart').click();
      break;
    case 'meeting': {
      for (const name of ans.present as string[]) await page.getByTestId(`attendee-${name}`).click();
      await page.getByTestId('meeting-next').click();
      await page.getByTestId('agenda-option').filter({ hasText: ans.agenda }).click();
      await page.getByTestId('meeting-next').click();
      // bubble the items into the requested order using the ▲ buttons
      for (let target = 0; target < ans.order.length; target++) {
        const id = ans.order[target];
        for (let k = 0; k < 4; k++) {
          const order: string[] = await page.evaluate(() =>
            [...document.querySelectorAll('[data-testid^="up-"]')].map((b) =>
              (b as HTMLElement).dataset.testid!.slice(3),
            ),
          );
          const at = order.indexOf(id);
          if (at <= target) break;
          await page.getByTestId(`up-${id}`).click();
        }
      }
      await page.getByTestId('meeting-next').click();
      await page.getByTestId(`owner-${ans.owner}`).click();
      await page.getByTestId('meeting-submit').click();
      break;
    }
    case 'server':
      for (const label of data.note as string[]) await page.getByTestId(`module-${label}`).click();
      break;
    case 'excel':
      for (const [k, v] of Object.entries(ans as Record<string, number>)) {
        const [r, c] = k.split(':');
        await page.getByTestId(`cell-${r}-${c}`).fill(String(v));
      }
      await page.getByTestId('excel-save').click();
      break;
    case 'idscan':
      {
        const badge = await center(page, 'badge');
        const scanner = await page.getByText('PLACE BADGE HERE').boundingBox();
        await page.mouse.move(badge.x, badge.y);
        await page.mouse.down();
        const tx = scanner!.x + scanner!.width / 2;
        const ty = scanner!.y + 60;
        await page.mouse.move(tx, ty, { steps: 15 });
        for (let i = 0; i < 22; i++) {
          await page.mouse.move(tx + (i % 2), ty);
          await page.waitForTimeout(100);
        }
        await page.mouse.up();
      }
      await page.getByTestId('badge-code').fill(data.code);
      await page.getByTestId('badge-verify').click();
      break;
  }
}
