import { expect, test } from '@playwright/test';

test('menu enters a compact first-person Three.js aircraft UI', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /CABIN MAYHEM/i })).toBeVisible();
  await page.getByRole('button', { name: 'Solo shift' }).click();

  await expect(page.getByTestId('technical-test-scene')).toBeVisible();
  await expect(page.getByTestId('three-canvas')).toBeVisible();
  await expect(page.locator('.landing-grid')).toHaveCount(0);
  await expect(page.locator('.dev-drawer')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.getByRole('button', { name: 'Turbulence' })).toBeHidden();
  await expect(page.getByTestId('service-mission')).toContainText(
    /needs (a drink|a meal|medical help)/,
  );
});

test('two isolated browsers join one host-authoritative WebRTC room', async ({ browser }) => {
  test.skip(!process.env.LIVE_MULTIPLAYER, 'Run with LIVE_MULTIPLAYER=1 for PeerJS cloud smoke.');
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  await Promise.all([host.goto('/'), guest.goto('/')]);

  await host.evaluate(() => window.__CABIN_MAYHEM_TEST__?.startMultiplayer('host'));
  await expect
    .poll(() => host.evaluate(() => window.__CABIN_MAYHEM_TEST__?.roomStatus()?.phase))
    .toBe('waiting');
  const roomCode = await host.evaluate(
    () => window.__CABIN_MAYHEM_TEST__?.roomStatus()?.roomCode ?? '',
  );
  expect(roomCode).toMatch(/^[A-Z2-9]{8}$/);

  await guest.evaluate(
    (code) => window.__CABIN_MAYHEM_TEST__?.startMultiplayer('guest', code),
    roomCode,
  );
  await expect
    .poll(() => host.evaluate(() => window.__CABIN_MAYHEM_TEST__?.roomStatus()?.phase), {
      timeout: 20_000,
    })
    .toBe('connected');
  await expect
    .poll(() => guest.evaluate(() => window.__CABIN_MAYHEM_TEST__?.roomStatus()?.phase), {
      timeout: 20_000,
    })
    .toBe('connected');

  await host.evaluate(() => window.__CABIN_MAYHEM_TEST__?.advancePhase());
  await expect
    .poll(() => guest.evaluate(() => window.__CABIN_MAYHEM_TEST__?.state()?.flight.phase))
    .toBe('taxi');
  await expect
    .poll(() => guest.evaluate(() => window.__CABIN_MAYHEM_TEST__?.state()?.tick))
    .toBeGreaterThan(5);

  await hostContext.close();
  await guestContext.close();
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
