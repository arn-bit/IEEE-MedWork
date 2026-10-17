import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests run against the PRODUCTION build (`vite preview`), so the strict
 * Content-Security-Policy is exercised. They use the locally installed Microsoft Edge
 * (channel "msedge") so no browser download is required.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4180',
    channel: 'msedge',
    headless: true,
    viewport: { width: 1280, height: 860 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4180',
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
