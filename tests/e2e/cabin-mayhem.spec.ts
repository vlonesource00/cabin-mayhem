import { expect, test } from '@playwright/test';

test('menu enters the first-person Three.js aircraft', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /CABIN MAYHEM/i })).toBeVisible();
  await page.getByRole('button', { name: 'Enter 3D aircraft' }).click();
  await expect(page.getByTestId('technical-test-scene')).toBeVisible();
  await expect(page.getByRole('heading', { name: '3D AIRCRAFT TEST DECK' })).toBeVisible();
  await expect(page.getByTestId('three-canvas')).toBeVisible();
  await expect(page.getByText('HOST AUTHORITY ONLINE')).toBeVisible();
  await expect(page.locator('[data-hud="objects"]')).toHaveText('7');
});

test('host debug creates readable turbulence feedback and advances phase', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter 3D aircraft' }).click();
  await page.getByRole('button', { name: 'Turbulence' }).click();
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

test('S walks backwards and E visibly owns the aimed service cart', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter 3D aircraft' }).click();

  const startY = await page.evaluate(
    () => window.__CABIN_MAYHEM_TEST__?.state()?.cabin.players['crew-alpha']?.position.y ?? 0,
  );
  await page.keyboard.down('s');
  await page.waitForTimeout(350);
  await page.keyboard.up('s');
  const backwardY = await page.evaluate(
    () => window.__CABIN_MAYHEM_TEST__?.state()?.cabin.players['crew-alpha']?.position.y ?? 0,
  );
  expect(backwardY).toBeLessThan(startY);

  await page.getByRole('button', { name: 'Cabin', exact: true }).click();
  await expect(page.locator('[data-hud="interaction"]')).toContainText('Service cart');
  await page.getByTestId('three-canvas').click();
  await page.keyboard.press('e');
  await expect(page.locator('[data-hud="held"]')).toHaveText('SERVICE CART');
  const ownership = await page.evaluate(() => {
    const state = window.__CABIN_MAYHEM_TEST__?.state();
    return {
      held: state?.cabin.players['crew-alpha']?.heldObjectId,
      owner: state?.cabin.objects['cart-01']?.ownerId,
    };
  });
  expect(ownership).toEqual({ held: 'cart-01', owner: 'crew-alpha' });
});
