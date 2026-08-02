import { expect, test } from '@playwright/test';

test('menu enters a compact first-person Three.js aircraft UI', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /CABIN MAYHEM/i })).toBeVisible();
  await page.getByRole('button', { name: 'Board the aircraft' }).click();

  await expect(page.getByTestId('technical-test-scene')).toBeVisible();
  await expect(page.getByTestId('three-canvas')).toBeVisible();
  await expect(page.locator('.landing-grid')).toHaveCount(0);
  await expect(page.locator('.dev-drawer')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.getByRole('button', { name: 'Turbulence' })).toBeHidden();
  await expect(page.getByTestId('service-mission')).toContainText(
    /needs (a drink|a meal|medical help)/,
  );
});

test('test bridge drives host turbulence and deterministic flight phases', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__CABIN_MAYHEM_TEST__?.start());
  await page.evaluate(() => window.__CABIN_MAYHEM_TEST__?.trigger('turbulence'));

  await expect(page.locator('[data-hud="caption"]')).toContainText('Turbulence');
  await page.evaluate(() => window.__CABIN_MAYHEM_TEST__?.advancePhase());
  await expect(page.locator('[data-hud="phase"]')).toHaveText('TAXI');
});

test('fire is exposed through the compact critical icon', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__CABIN_MAYHEM_TEST__?.start());
  await page.evaluate(() => window.__CABIN_MAYHEM_TEST__?.trigger('fire'));

  await expect(page.getByTestId('fire-status')).toContainText('FIRE');
  await expect(page.locator('[data-hud="caption"]')).toContainText('GALLEY FIRE');
});

test('test bridge completes the coffee-machine mutiny through the host', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__CABIN_MAYHEM_TEST__?.start());
  await page.evaluate(() => {
    for (let phase = 0; phase < 3; phase += 1) window.__CABIN_MAYHEM_TEST__?.advancePhase();
    window.__CABIN_MAYHEM_TEST__?.trigger('repair');
  });
  await expect(page.getByTestId('service-mission')).toContainText('Coffee machine mutiny');

  await page.evaluate(() => window.__CABIN_MAYHEM_TEST__?.completeRepair());
  await expect
    .poll(() => page.evaluate(() => window.__CABIN_MAYHEM_TEST__?.state()?.repair.status))
    .toBe('fixed');
  await expect(page.locator('[data-hud="caption"]')).toContainText('LOST THE ELECTION');
});

test('test bridge reaches a safe terminal phase', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__CABIN_MAYHEM_TEST__?.start());
  await page.evaluate(() => {
    for (let index = 0; index < 5; index += 1) window.__CABIN_MAYHEM_TEST__?.advancePhase();
  });
  await expect(page.locator('[data-hud="phase"]')).toHaveText('LANDED');
});
