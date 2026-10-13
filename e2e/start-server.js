// The real production server on a throw-away in-memory MongoDB, for Playwright (run `npm run build` first).
import { MongoMemoryServer } from 'mongodb-memory-server'

const mongod = await MongoMemoryServer.create()

process.env.NODE_ENV = 'production'
process.env.MONGO_URI = mongod.getUri()
process.env.PORT ??= '5100'
process.env.JWT_SECRET ??= 'e2e-only-secret-that-is-at-least-32-characters'
// every spec shares one IP, so the per-IP limits would trip; never set in real deploys
process.env.E2E_DISABLE_RATE_LIMITS = 'true'
// set (even blank) so dotenv can't pull real keys in from server/.env
process.env.GOOGLE_CLIENT_ID = ''
process.env.GOOGLE_CLIENT_SECRET = ''
process.env.GEMINI_API_KEY = 'e2e-fake-key'
const { installFakeGemini } = await import('./fakeGemini.js')
installFakeGemini()
// push stays off, so a test can never post to a real push service
process.env.VAPID_PUBLIC_KEY = ''
process.env.VAPID_PRIVATE_KEY = ''

// imported only now, because config/env.js validates process.env on load
await import('../server/src/server.js')

// test server only: "admin_e2e..." accounts become admins and "legacy_e2e..." ones pre-photo-rule accounts
const { User } = await import('../server/src/models/User.js')
setInterval(() => {
  User.updateMany({ username: /^admin_e2e/, isAdmin: false }, { isAdmin: true }).catch(() => {})
  User.updateMany({ username: /^legacy_e2e/, photoRequired: true }, { photoRequired: false }).catch(() => {})
}, 200)

process.on('exit', () => {
  mongod.stop().catch(() => {})
})
