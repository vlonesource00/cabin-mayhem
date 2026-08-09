import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';

test('runtime POV arms and bounded cruise lighting are visible', async ({ page }) => {
  mkdirSync('test-results/presentation-evidence', { recursive: true });
  await page.goto('/');
  await page.evaluate(() => window.__CABIN_MAYHEM_TEST__?.start());

  const canvas = page.getByTestId('three-canvas');
  await expect(canvas).toHaveAttribute('data-arms-rig', 'glb');
  await expect(canvas).toHaveAttribute('data-arms-presentation', 'rounded');
  await expect(canvas).not.toHaveAttribute('data-arms-socket', 'none');
  await expect(canvas).toHaveAttribute('data-arms-source', 'rounded-fallback');
  await expect(canvas).toHaveAttribute('data-lighting-mode', 'bounded-zones');
  await expect(canvas).toHaveAttribute('data-shadow-mode', 'directional-pcf-soft-1024');
  await page.screenshot({ path: 'test-results/presentation-evidence/rounded-arms-lit-scene.png' });
});
