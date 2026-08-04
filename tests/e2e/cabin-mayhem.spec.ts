import { expect, test } from '@playwright/test';

test('menu enters a compact first-person Three.js aircraft UI', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /CABIN MAYHEM/i })).toBeVisible();
  await page.getByRole('button', { name: 'Solo shift' }).click();

  await expect(page.getByTestId('technical-test-scene')).toBeVisible();
  await expect(page.getByTestId('three-canvas')).toBeVisible();
  await expect(page.getByTestId('three-canvas')).toHaveAttribute('data-asset-mode', 'glb');
  await expect(page.locator('.landing-grid')).toHaveCount(0);
  await expect(page.locator('.dev-drawer')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.getByRole('button', { name: 'Turbulence' })).toBeHidden();
  await expect(page.getByTestId('service-mission')).toContainText(
    /needs (a drink|a meal|medical help)/,
  );
});

test('procedural cabin remains playable when production GLB fails', async ({ page }) => {
  await page.route('**/assets/scenarios/cabin-mayhem-scenario.glb', (route) => route.abort());
  await page.goto('/');
  await page.getByRole('button', { name: 'Solo shift' }).click();

  const canvas = page.getByTestId('three-canvas');
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute('data-asset-mode', 'fallback');
  await expect(page.getByTestId('service-mission')).toContainText('CABIN CALL');
});

test('authored character and first-person rigs load and animate', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Solo shift' }).click();

  const canvas = page.getByTestId('three-canvas');
  await expect(canvas).toHaveAttribute('data-character-rig', 'glb');
  await expect(canvas).toHaveAttribute('data-arms-rig', 'glb');
});

test('cabin keeps its procedural animation when a rig GLB fails', async ({ page }) => {
  await page.route('**/assets/characters/*.glb', (route) => route.abort());
  await page.goto('/');
  await page.getByRole('button', { name: 'Solo shift' }).click();

  const canvas = page.getByTestId('three-canvas');
  await expect(canvas).toHaveAttribute('data-character-rig', 'fallback');
  await expect(canvas).toHaveAttribute('data-arms-rig', 'fallback');
  // The mission still runs: nothing in the animation layer is authoritative.
  await expect(page.getByTestId('service-mission')).toContainText('CABIN CALL');
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
    .poll(() => guest.evaluate(() => window.__CABIN_MAYHEM_TEST__?.state()?.voyage.phase))
    .toBe('preparation');
  await expect
    .poll(() => guest.evaluate(() => window.__CABIN_MAYHEM_TEST__?.state()?.tick))
    .toBeGreaterThan(5);

  await host.evaluate(() => window.__CABIN_MAYHEM_TEST__?.completeShift('failed'));
  await expect
    .poll(() => guest.evaluate(() => window.__CABIN_MAYHEM_TEST__?.state()?.service.outcome))
    .toBe('failed');
  await host
    .getByTestId('landing-debrief')
    .getByRole('button', { name: 'FLY ANOTHER SHIFT' })
    .click();
  await expect
    .poll(() => guest.evaluate(() => window.__CABIN_MAYHEM_TEST__?.state()?.service.outcome))
    .toBe('active');
  await expect
    .poll(() => host.evaluate(() => window.__CABIN_MAYHEM_TEST__?.roomStatus()?.phase))
    .toBe('connected');
  await expect(
    host.evaluate(() => window.__CABIN_MAYHEM_TEST__?.roomStatus()?.roomCode),
  ).resolves.toBe(roomCode);

  await hostContext.close();
  await guestContext.close();
});

test('test bridge drives host turbulence and deterministic voyage phases', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__CABIN_MAYHEM_TEST__?.start());
  await page.evaluate(() => window.__CABIN_MAYHEM_TEST__?.trigger('turbulence'));

  await expect(page.locator('[data-hud="caption"]')).toContainText('Heavy weather');
  await page.evaluate(() => window.__CABIN_MAYHEM_TEST__?.advancePhase());
  await expect(page.locator('[data-hud="phase"]')).toHaveText('PREPARATION');
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

test('failed landing shows reviews, score and incident results', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__CABIN_MAYHEM_TEST__?.start());
  await page.evaluate(() => {
    window.__CABIN_MAYHEM_TEST__?.trigger('fire');
    window.__CABIN_MAYHEM_TEST__?.completeShift('failed');
  });
  await expect(page.locator('[data-hud="phase"]')).toHaveText('DOCKED');
  const debrief = page.getByTestId('landing-debrief');
  await expect(debrief).toBeVisible();
  await expect(debrief.locator('[data-debrief="outcome-label"]')).toHaveText('SHIFT LOST');
  await expect(debrief.locator('[data-debrief="score"]')).toHaveText('-35');
  await expect(debrief.locator('[data-debrief="served"]')).toHaveText('0');
  await expect(debrief.locator('[data-debrief="missed"]')).toHaveText('0');
  await expect(debrief.locator('[data-debrief="fire-result"]')).toHaveText('STILL BURNING');
  await expect(debrief.locator('[data-debrief="repair-result"]')).toHaveText('NO INCIDENT');
  await expect(debrief.locator('.passenger-review')).toHaveCount(4);
});

test('successful landing can fly another shift', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__CABIN_MAYHEM_TEST__?.start());
  await page.evaluate(() => window.__CABIN_MAYHEM_TEST__?.completeShift('success'));

  const debrief = page.getByTestId('landing-debrief');
  await expect(debrief).toBeVisible();
  await expect(debrief.locator('[data-debrief="outcome-label"]')).toHaveText('SHIFT CLEARED');
  await expect(debrief.locator('[data-debrief="served"]')).toHaveText('3');
  await expect(debrief.locator('[data-debrief="missed"]')).toHaveText('0');
  await expect(debrief.locator('[data-debrief="outcome"]')).toHaveText('SUCCESS');

  await debrief.getByRole('button', { name: 'FLY ANOTHER SHIFT' }).click();
  await expect(debrief).toBeHidden();
  await expect(page.locator('[data-hud="phase"]')).toHaveText('MOORED');
  await expect
    .poll(() => page.evaluate(() => window.__CABIN_MAYHEM_TEST__?.state()?.service.outcome))
    .toBe('active');
});

test('landing debrief remains usable on a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 720 });
  await page.goto('/');
  await page.evaluate(() => window.__CABIN_MAYHEM_TEST__?.start());
  await page.evaluate(() => window.__CABIN_MAYHEM_TEST__?.completeShift('failed'));

  const debrief = page.getByTestId('landing-debrief');
  await expect(debrief).toBeVisible();
  const card = debrief.locator('.debrief__card');
  await expect(card).toBeVisible();
  const box = await card.boundingBox();
  expect(box?.x).toBeGreaterThanOrEqual(0);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(390);
  await expect(debrief.getByRole('button', { name: 'FLY ANOTHER SHIFT' })).toBeVisible();
});
