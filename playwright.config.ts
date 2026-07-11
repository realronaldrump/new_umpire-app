import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:5180',
    browserName: 'chromium',
    channel: 'chrome',
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'VITE_MULTIPLAYER_ORIGIN=http://127.0.0.1:8788 npm run dev -- --host 127.0.0.1 --port 5180 --strictPort',
      url: 'http://127.0.0.1:5180',
      name: 'Vite client',
      timeout: 120_000,
      reuseExistingServer: true,
    },
    {
      command: 'wrangler dev --ip 127.0.0.1 --port 8788 --var TIMING_SCALE:0.03',
      url: 'http://127.0.0.1:8788/health',
      name: 'Room worker',
      timeout: 120_000,
      reuseExistingServer: true,
    },
  ],
})
