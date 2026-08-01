import { expect, test } from '@playwright/test';

test('menu reaches Phase 1 technical aircraft scene', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /CABIN MAYHEM/i })).toBeVisible();
  await page.getByRole('button', { name: 'Launch technical test scene' }).click();
  await expect(page.getByTestId('technical-test-scene')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Technical Test Scene' })).toBeVisible();
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByText('HOST AUTHORITY ONLINE')).toBeVisible();
});

test('host debug creates readable turbulence feedback and advances phase', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Launch technical test scene' }).click();
  await page.getByRole('button', { name: 'Trigger turbulence' }).click();
  await expect(page.locator('[data-hud="caption"]')).toContainText('Turbulence');
  await page.getByRole('button', { name: 'Complete phase' }).click();
  await expect(page.locator('[data-hud="phase"]')).toHaveText('TAXI');
});

test('test bridge resets and reaches a safe terminal phase', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__CABIN_MAYHEM_TEST__?.start());
  await page.evaluate(() => {
    for (let index = 0; index < 5; index += 1) window.__CABIN_MAYHEM_TEST__?.advancePhase();
  });
  await expect(page.locator('[data-hud="phase"]')).toHaveText('LANDED');
});
