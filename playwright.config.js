import { defineConfig, devices } from '@playwright/test'

const PORT = 5100

// End-to-end tests drive a real browser against the PRODUCTION build: one
// Node process serving the API, the sockets and client/dist - exactly what
// gets deployed. e2e/start-server.js gives it a throw-away in-memory MongoDB.
export default defineConfig({
  testDir: './e2e',
  // The tests share one server, and the login/register rate limit is per IP,
  // so run them one at a time.
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
    // Always a fresh server, so every run starts with an empty database and
    // fresh rate-limit counters.
    reuseExistingServer: false,
    timeout: 180_000,
    env: { PORT: String(PORT) },
  },
})
