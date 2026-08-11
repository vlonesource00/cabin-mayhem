import { defineConfig, devices } from '@playwright/test';

const isCI = Boolean(process.env.CI);
const DEFAULT_LOCAL_WORKERS = 1;
const MAX_LOCAL_WORKERS = 4;

function resolveLocalWorkers(value: string | undefined): number {
  const workers = Number(value);

  return Number.isSafeInteger(workers) &&
    workers >= DEFAULT_LOCAL_WORKERS &&
    workers <= MAX_LOCAL_WORKERS
    ? workers
    : DEFAULT_LOCAL_WORKERS;
}

const workers = isCI ? DEFAULT_LOCAL_WORKERS : resolveLocalWorkers(process.env.PLAYWRIGHT_WORKERS);

// GitHub's runners have no GPU, so Chromium software-rasterises the Three.js
// cabin. The authored GLB scenario roughly doubles per-frame cost against the
// procedural fallback (measured 116.7ms -> 233.3ms at 6x CPU throttle), and a
// saturated main thread starves Playwright's rAF-driven actionability polling.
//
// The 30s developer budget dated from the single-cabin scenario. A cruise ship
// of 14 authored compartments plus the always-resident exterior costs ~25s to
// boot per test against an unbundled dev server even on a real GPU, so every
// scenario that then does real work ran the clock out. Both environments now
// get the same 90s, and the handful of long end-to-end journeys raise it
// themselves.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers,
  timeout: 90_000,
  expect: { timeout: isCI ? 15_000 : 10_000 },
  retries: isCI ? 1 : 0,
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm vite --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
  },
});
