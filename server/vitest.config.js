import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.js'],
    // set before any test file loads, since src/config/env.js validates on import
    env: {
      NODE_ENV: 'test',
      // only has to pass validation: tests/setup.js connects to an in-memory MongoDB
      MONGO_URI: 'mongodb://127.0.0.1:27017/pingme-test',
      JWT_SECRET: 'test-secret-that-is-at-least-32-characters-long',
    },
  },
})
