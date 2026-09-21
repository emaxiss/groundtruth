import { defineConfig, devices } from '@playwright/test';

// The browser suite runs against the built app in fake mode: no key, no
// network, byte-identical answers, so every assertion below is exact.
const PORT = Number(process.env.GROUNDTRUTH_E2E_PORT ?? 3114);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    env: { GROUNDTRUTH_FAKE_LLM: '1' },
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
