import { expect, test } from '@playwright/test';

test('menu enters the first-person Three.js aircraft', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /CABIN MAYHEM/i })).toBeVisible();
  await page.getByRole('button', { name: 'Enter 3D aircraft' }).click();
  await expect(page.getByTestId('technical-test-scene')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'CABIN SERVICE UNDER PRESSURE' })).toBeVisible();
  await expect(page.getByTestId('three-canvas')).toBeVisible();
  await expect(page.getByText('HOST HAS YOUR BACK')).toBeVisible();
  await expect(page.locator('[data-hud="objects"]')).toHaveText('8');
  await expect(page.getByTestId('service-mission')).toContainText('Ana');
  await expect(page.getByTestId('service-mission')).toContainText('medical help');
});

test('host debug creates readable turbulence feedback and advances phase', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter 3D aircraft' }).click();
  await page.getByRole('button', { name: 'Turbulence' }).click();
  await expect(page.locator('[data-hud="caption"]')).toContainText('Turbulence');
  await page.getByRole('button', { name: 'Complete phase' }).click();
  await expect(page.locator('[data-hud="phase"]')).toHaveText('TAXI');
});

test('R launches from ground', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter 3D aircraft' }).click();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.down('r');
  await page.waitForTimeout(9000);
  await page.keyboard.up('r');
  await expect(page.locator('[data-hud="phase"]')).toHaveText(/TAKEOFF|CRUISE/);
  await expect(page.locator('[data-hud="altitude"]')).not.toHaveText('0');
});

test('Fire alarm exposes emergency HUD', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter 3D aircraft' }).click();
  await page.getByRole('button', { name: 'Fire alarm' }).click();
  await expect(page.getByTestId('fire-status')).toContainText('BURNING');
  await expect(page.locator('[data-hud="caption"]')).toContainText('GALLEY FIRE');
});

test('test bridge resets and reaches a safe terminal phase', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__CABIN_MAYHEM_TEST__?.start());
  await page.evaluate(() => {
    for (let index = 0; index < 5; index += 1) window.__CABIN_MAYHEM_TEST__?.advancePhase();
  });
  await expect(page.locator('[data-hud="phase"]')).toHaveText('LANDED');
});

test('S walks backwards and the service cart dispenses, returns and moves stock', async ({
  page,
}) => {
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
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('3');
  await expect(page.locator('[data-hud="cart-selection"]')).toHaveText('3 MEDICAL');
  await page.keyboard.press('e');
  await expect(page.locator('[data-hud="held"]')).toHaveText('CABIN MEDKIT');
  await expect(page.locator('[data-hud="cart-stock"]')).toContainText('MED 1');
  await expect(page.locator('[data-hud="interaction"]')).toContainText('return');
  await page.keyboard.press('e');
  await expect(page.locator('[data-hud="held"]')).toHaveText('EMPTY');
  await expect(page.locator('[data-hud="cart-stock"]')).toContainText('MED 2');
  await page.keyboard.down('Shift');
  await page.keyboard.press('e');
  await page.keyboard.up('Shift');
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
