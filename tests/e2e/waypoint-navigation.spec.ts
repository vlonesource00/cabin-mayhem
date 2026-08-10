import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';

test('shows physical portal pads and host-validated elevator selection', async ({ page }) => {
  test.setTimeout(90_000);
  mkdirSync('test-results/correction-evidence', { recursive: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await page.evaluate(() => window.__CABIN_MAYHEM_TEST__?.start());

  const canvas = page.getByTestId('three-canvas');
  await expect(canvas).toHaveAttribute('data-audio-continuous-sources', '0');
  await expect(canvas).toHaveAttribute('data-asset-mode', 'glb', { timeout: 15_000 });
  await expect(page.getByTestId('waypoint-panel')).toHaveCount(0);
  await page.evaluate(() => window.__CABIN_MAYHEM_TEST__?.showPortalPad());

  await expect(canvas).toHaveAttribute('data-local-compartment-id', 'atrium');
  await expect(canvas).toHaveAttribute('data-portal-pad-visible', 'true');
  await expect(canvas).toHaveAttribute('data-portal-pad-id', 'elevator-pad:grand-atrium');
  await expect
    .poll(() => canvas.getAttribute('data-portal-pad-ids'))
    .toContain('door-pad:atrium:stairwell-aft:0');
  await expect(canvas).toHaveAttribute('data-portal-pad-ids', /elevator-pad:grand-atrium/);
  await expect
    .poll(() => canvas.getAttribute('data-portal-pad-options'))
    .toContain('elevator-option:grand-atrium:deck-4');

  const first = await canvas.getAttribute('data-portal-pad-selected');
  expect(first).toBe('elevator-option:grand-atrium:deck-2');
  await expect(canvas).toHaveAttribute('data-local-deck', '2');
  const deckTwoCameraY = Number(await canvas.getAttribute('data-camera-y'));
  expect(Number.isFinite(deckTwoCameraY)).toBe(true);
  await page.screenshot({ path: 'test-results/correction-evidence/d2-lift-pad.png' });
  await page.mouse.wheel(0, 100);
  await expect.poll(() => canvas.getAttribute('data-portal-pad-selected')).not.toBe(first);
  await page.screenshot({ path: 'test-results/correction-evidence/portal-picker.png' });
  await page.setViewportSize({ width: 1280, height: 720 });

  expect(await page.evaluate(() => window.scrollY)).toBe(0);

  await page.mouse.wheel(0, 100);
  await expect(canvas).toHaveAttribute(
    'data-portal-pad-selected',
    'elevator-option:grand-atrium:deck-4',
  );

  await page.keyboard.press('e');
  await expect
    .poll(() =>
      page.evaluate(
        () => window.__CABIN_MAYHEM_TEST__?.state()?.cabin.players['crew-alpha']?.waypointDeck,
      ),
    )
    .toBe(4);
  await expect(canvas).toHaveAttribute('data-local-deck', '4');
  await expect(canvas).toHaveAttribute('data-portal-pad-ids', /elevator-pad:grand-atrium/);
  await expect(canvas).not.toHaveAttribute('data-portal-pad-ids', /door-pad:atrium:/);
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-camera-y')) - deckTwoCameraY)
    .toBeGreaterThan(6.2);
  expect(Number(await canvas.getAttribute('data-camera-y')) - deckTwoCameraY).toBeLessThan(6.6);
  await page.screenshot({
    path: 'test-results/correction-evidence/upper-deck-lift-no-wrong-door-pads.png',
  });
});

test('aft stair pad shows real destinations, travels to Main Galley, and is occluded by walls', async ({
  page,
}) => {
  test.setTimeout(90_000);
  mkdirSync('test-results/correction-evidence', { recursive: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(process.env.CABIN_TEST_BASE_URL ?? '/');
  await page.evaluate(() => window.__CABIN_MAYHEM_TEST__?.start());
  const canvas = page.getByTestId('three-canvas');
  await expect(canvas).toHaveAttribute('data-asset-mode', 'glb', { timeout: 15_000 });
  await page.evaluate(() => window.__CABIN_MAYHEM_TEST__?.showAftStair());
  await expect(canvas).toHaveAttribute('data-portal-pad-id', 'door-pad:atrium:stairwell-aft:0');
  await expect(canvas).toHaveAttribute('data-portal-pad-options', /Main galley:D2/);
  await expect(canvas).toHaveAttribute('data-portal-pad-options', /Engine room:D0/);
  await page.screenshot({
    path: 'test-results/correction-evidence/aft-stair-destination-picker.png',
  });

  let selected = await canvas.getAttribute('data-portal-pad-selected');
  for (let tick = 0; tick < 4 && !selected?.includes('main-galley'); tick += 1) {
    await page.mouse.wheel(0, 100);
    selected = await canvas.getAttribute('data-portal-pad-selected');
  }
  expect(selected).toContain('main-galley');
  await page.keyboard.press('e');
  await expect
    .poll(() =>
      page.evaluate(
        () => window.__CABIN_MAYHEM_TEST__?.state()?.cabin.players['crew-alpha']?.compartmentId,
      ),
    )
    .toBe('main-galley');
  await expect(canvas).toHaveAttribute('data-local-compartment-id', 'main-galley');
  await page.screenshot({ path: 'test-results/correction-evidence/main-galley-arrival.png' });

  await page.evaluate(() => window.__CABIN_MAYHEM_TEST__?.showAftStair());
  await expect(canvas).toHaveAttribute('data-portal-pad-id', 'door-pad:atrium:stairwell-aft:0');
  await page.screenshot({
    path: 'test-results/correction-evidence/portal-visible-line-of-sight.png',
  });
  await page.evaluate(() => window.__CABIN_MAYHEM_TEST__?.showPortalOccluded());
  await expect(canvas).not.toHaveAttribute('data-portal-pad-visible', 'true');
  await page.screenshot({ path: 'test-results/correction-evidence/portal-occluded-by-wall.png' });
});
