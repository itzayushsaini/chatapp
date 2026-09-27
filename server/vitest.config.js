import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.js'],
    // Env values used only by tests. They are applied before any test file is
    // imported, which matters because src/config/env.js validates the
    // environment the moment it is loaded.
    env: {
      NODE_ENV: 'test',
      // app.js never opens a database connection - tests/setup.js does that
      // against an in-memory MongoDB - so this only has to satisfy validation.
      MONGO_URI: 'mongodb://127.0.0.1:27017/pingme-test',
      JWT_SECRET: 'test-secret-that-is-at-least-32-characters-long',
    },
  },
})
