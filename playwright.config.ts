import { defineConfig } from '@playwright/test';
import { E2E_BASE_URL } from './e2e/constants';

export default defineConfig({
  testDir: './e2e',
  // The game server runs inside this process, so its port and sockets are
  // released when the run ends instead of leaving a stray listener behind.
  globalSetup: './e2e/global-setup.ts',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: E2E_BASE_URL,
    headless: true,
    viewport: { width: 1280, height: 900 },
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    // Always-on tracing writes constant temp files under Documents, which a
    // synced/antivirus-scanned folder can lose mid-run. Failures still keep a
    // screenshot; run `npx playwright test --trace on` when a trace is needed.
    trace: 'off',
    screenshot: 'only-on-failure',
  },
});
