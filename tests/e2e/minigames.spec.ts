import { expect, test } from '@playwright/test';
import { TASK_INFO, TASK_TYPES } from '@corp/shared';
import { solveOpenTask } from './helpers';

// Every one of the ten minigames, played through its real UI, accepted by the shared verifier.
for (const type of TASK_TYPES) {
  test(`minigame UI: ${TASK_INFO[type].title}`, async ({ page }) => {
    await page.goto('/?gallery');
    await page.getByTestId(`gallery-${type}`).click();
    await solveOpenTask(page, { respectMinTime: false });
    await expect(page.getByTestId('gallery-log')).toContainText(`${type}: ACCEPTED`);
    await expect(page.getByTestId('task-success')).toBeVisible();
  });
}
