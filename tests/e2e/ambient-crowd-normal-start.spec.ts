import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';

/**
 * Normal-start evidence for the two runtime issues CURRENT_STATUS.md recorded.
 *
 * The focused `showCrowd()` teleport proves the presenter can draw a crowd; it
 * does not prove the crowd is there when a player simply starts the game. This
 * test never teleports: it starts, waits for the authored rig, and reads the
 * seams from the atrium the crew actually spawns in.
 *
 * It also guards the two fixes:
 *   - the host spawns on the authored centreline walk, not inside the scenic
 *     lift car at authored z -16.5, which is what made the atrium look empty;
 *   - the navigation alert is really hidden while the ship is moored, which a
 *     JS-level `hidden` assertion cannot prove because the bug was an author
 *     `display: grid` outranking the user-agent `[hidden]` rule.
 */
test('the atrium is populated at a clean start', async ({ page }) => {
  test.setTimeout(60_000);
  mkdirSync('test-results/correction-evidence', { recursive: true });
  await page.goto('/');
  await page.evaluate(() => window.__CABIN_MAYHEM_TEST__?.start());

  const canvas = page.getByTestId('three-canvas');
  await expect(canvas).toHaveAttribute('data-local-compartment-id', 'atrium');
  await expect(canvas).toHaveAttribute('data-character-rig', 'glb');
  await expect(canvas).toHaveAttribute('data-crowd-asset', 'glb');
  await expect(canvas).toHaveAttribute('data-crowd-residents', '78');
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-crowd-visible')))
    .toBeGreaterThan(0);
  // `data-crowd-visible` counts allocated instances and stayed at 24 through the
  // whole period the crowd was missing from every render list, so it cannot
  // guard this. `data-crowd-drawn-meshes` counts meshes the renderer actually
  // drew last frame: four body primitives per guest, so a populated atrium is
  // far above zero and a silently dropped crowd reads exactly zero.
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-crowd-drawn-meshes')), {
      timeout: 15_000,
    })
    .toBeGreaterThan(8);
  await expect(canvas).toHaveAttribute('data-crowd-floating-count', '0');

  const spawn = await page.evaluate(() => {
    const state = window.__CABIN_MAYHEM_TEST__?.state();
    const player = state?.cabin.players['crew-alpha'];
    return player ? { x: player.position.x, y: player.position.y } : undefined;
  });
  // Authored ship coordinates are (x - 12, y - 23). The lift car stands on the
  // centreline over authored z -16.85..-14.55; the grand stair flight occupies
  // authored z 10.60..17.00. Neither may contain a spawn.
  expect(spawn).toBeDefined();
  const authoredZ = (spawn?.y ?? 0) - 23;
  expect(authoredZ).toBeGreaterThan(-14.55);
  expect(authoredZ).toBeLessThan(10.6);

  await expect(page.getByTestId('navigation-alert')).toBeHidden();
  await page.screenshot({ path: 'test-results/correction-evidence/normal-start-atrium.png' });
});
