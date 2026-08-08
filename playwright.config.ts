import { defineConfig, devices } from '@playwright/test';

const isCI = Boolean(process.env.CI);

// GitHub's runners have no GPU, so Chromium software-rasterises the Three.js
// cabin. The authored GLB scenario roughly doubles per-frame cost against the
// procedural fallback (measured 116.7ms -> 233.3ms at 6x CPU throttle), and a
// saturated main thread starves Playwright's rAF-driven actionability polling.
// CI therefore gets a larger budget than a developer machine with a real GPU.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  timeout: isCI ? 90_000 : 30_000,
  expect: { timeout: isCI ? 15_000 : 5_000 },
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
