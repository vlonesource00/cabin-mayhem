import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

test('shows the named waypoint chart and Grand Atrium elevator route', async ({ page }) => {
  mkdirSync('test-results/navigation-evidence', { recursive: true });
  await page.goto('/');
  await page.evaluate(() => window.__CABIN_MAYHEM_TEST__?.start());

  await page.getByRole('button', { name: 'F1' }).click();
  const panel = page.getByTestId('waypoint-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('WAYPOINT NAVIGATION');
  await expect(panel.locator('[data-hud="waypoint-map"]')).toContainText(
    'ELEVATOR  GRAND ATRIUM  D2 / D3 / D4 / D5',
  );
  await page.screenshot({
    path: 'test-results/navigation-evidence/waypoint-chart.png',
    fullPage: true,
  });

  await panel.getByRole('button', { name: /Grand Atrium Elevator/ }).click();
  await expect(page.locator('[data-hud="waypoint-status"]')).toContainText(
    /WALKING|ELEVATOR|ARRIVED/,
  );
  await page.screenshot({
    path: 'test-results/navigation-evidence/grand-atrium-elevator.png',
    fullPage: true,
  });
});
