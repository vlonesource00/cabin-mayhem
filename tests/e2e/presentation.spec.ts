import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';

test('runtime POV arms and bounded cruise lighting are visible', async ({ page }) => {
  test.setTimeout(60_000);
  mkdirSync('test-results/correction-evidence', { recursive: true });
  await page.goto('/');
  await page.evaluate(() => window.__CABIN_MAYHEM_TEST__?.start());

  const canvas = page.getByTestId('three-canvas');
  await expect(canvas).toHaveAttribute('data-arms-rig', 'glb');
  await expect(canvas).toHaveAttribute('data-arms-presentation', 'rounded');
  await expect(canvas).toHaveAttribute('data-arms-profile', 'compact-low');
  await expect(canvas).not.toHaveAttribute('data-arms-socket', 'none');
  await expect(canvas).toHaveAttribute('data-arms-missing', '');
  await expect(canvas).toHaveAttribute('data-arms-source', 'glb-rounded');
  await expect(canvas).toHaveAttribute('data-audio-continuous-sources', '0');
  await expect(canvas).toHaveAttribute('data-lighting-mode', 'bounded-zones');
  await expect(canvas).toHaveAttribute('data-shadow-mode', 'directional-pcf-soft-1024');
  await page.screenshot({ path: 'test-results/correction-evidence/compact-arms.png' });
});

test('near-wall depth contract keeps compact arms and door surfaces visible', async ({ page }) => {
  test.setTimeout(60_000);
  mkdirSync('test-results/correction-evidence', { recursive: true });
  await page.goto(process.env.CABIN_TEST_BASE_URL ?? '/');
  await page.evaluate(() => window.__CABIN_MAYHEM_TEST__?.start());
  const canvas = page.getByTestId('three-canvas');
  await expect(canvas).toHaveAttribute('data-camera-near', '0.12');
  await expect(canvas).toHaveAttribute('data-camera-far', '2400');
  await expect(canvas).toHaveAttribute(
    'data-depth-contract',
    'near:0.12;far:2400;logarithmic:true',
  );
  await expect(canvas).toHaveAttribute('data-logarithmic-depth-buffer', 'true');
  await expect(canvas).toHaveAttribute('data-arms-profile', 'compact-low');
  await page.evaluate(() => window.__CABIN_MAYHEM_TEST__?.showPortalPad());
  await expect(canvas).toHaveAttribute('data-local-compartment-id', 'atrium');
  await page.screenshot({ path: 'test-results/correction-evidence/near-wall-depth-and-arms.png' });
});
