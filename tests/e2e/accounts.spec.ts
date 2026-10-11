import { expect, test } from '@playwright/test';
import { onboard } from './helpers';

test('guest can register, sees stats, logs out and logs back in', async ({ page }) => {
  await onboard(page, 'Acct Ada');
  await expect(page.getByText('Guest badge · temporary')).toBeVisible();
  await page.getByRole('button', { name: /Log in \/ Register/ }).click();
  await page.getByRole('button', { name: 'New here? Create an account' }).click();
  const user = `Ada${Date.now() % 100000}`;
  await page.getByTestId('acct-username').fill(user);
  await page.getByTestId('acct-password').fill('weak');
  await page.getByTestId('acct-submit').click();
  await expect(page.getByText(/at least 8 characters/)).toBeVisible();
  await page.getByTestId('acct-password').fill('synergy2026');
  await page.getByTestId('acct-submit').click();
  await expect(page.getByText('Your employee file')).toBeVisible();
  await expect(page.getByRole('dialog').getByText(`@${user}`)).toBeVisible();
  await expect(page.getByRole('dialog').getByText('Matches')).toBeVisible();
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible();
  await page.getByTestId('acct-username').fill(user);
  await page.getByTestId('acct-password').fill('wrong-password-1');
  await page.getByTestId('acct-submit').click();
  await expect(page.getByText('Invalid username or password.')).toBeVisible();
  await page.getByTestId('acct-password').fill('synergy2026');
  await page.getByTestId('acct-submit').click();
  await expect(page.getByText('Your employee file')).toBeVisible();
});
