// Starts the REAL production server (API + sockets + built client) against a
// throw-away in-memory MongoDB. Used by Playwright (see playwright.config.js)
// so the end-to-end tests need no database installed and never touch real
// data. Run `npm run build` first so client/dist exists.
import { MongoMemoryServer } from 'mongodb-memory-server'

const mongod = await MongoMemoryServer.create()

process.env.NODE_ENV = 'production'
process.env.MONGO_URI = mongod.getUri()
process.env.PORT ??= '5100'
// A fixed secret is fine here: this server only ever holds test data.
process.env.JWT_SECRET ??= 'e2e-only-secret-that-is-at-least-32-characters'
// Every spec file's register/login calls share this one process and one IP,
// so together they would trip the per-IP rate limit meant for a single
// abusive caller. See middleware/rateLimits.js - never set in real deploys.
process.env.E2E_DISABLE_RATE_LIMITS = 'true'

// Imported only now, because config/env.js validates process.env on load.
await import('../server/src/server.js')

// server.js exits on SIGINT/SIGTERM; stop MongoDB along with it.
process.on('exit', () => {
  mongod.stop().catch(() => {})
})
