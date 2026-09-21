import { defineConfig, devices } from '@playwright/test';

// Both Playwright suites run against the built app in fake mode: no key, no
// network, byte-identical answers, so every assertion is exact.
const PORT = Number(process.env.GROUNDTRUTH_E2E_PORT ?? 3114);
const CI = Boolean(process.env.CI);

export default defineConfig({
  fullyParallel: true,
  forbidOnly: CI,
  retries: 0,
  reporter: CI
    ? [['list'], ['html', { open: 'never' }], ['junit', { outputFile: 'test-results/junit.xml' }]]
    : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    // API contract over HTTP. Uses the request fixture, so it needs no browser.
    { name: 'contract', testDir: './tests/contract' },
    { name: 'chromium', testDir: './tests/e2e', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', testDir: './tests/e2e', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', testDir: './tests/e2e', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile', testDir: './tests/e2e', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `pnpm start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    env: { GROUNDTRUTH_FAKE_LLM: '1' },
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
