import { defineConfig, devices } from '@playwright/test'

const PORT = 5100

export default defineConfig({
  testDir: './e2e',
  // the tests share one server, so run them one at a time
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 30_000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build && node e2e/start-server.js',
    url: `http://localhost:${PORT}/api/health`,
    // always a fresh server, so every run starts with an empty database
    reuseExistingServer: false,
    timeout: 180_000,
    env: { PORT: String(PORT) },
  },
})
