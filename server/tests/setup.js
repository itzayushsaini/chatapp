import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { afterAll, afterEach, beforeAll } from 'vitest'

import { env } from '../src/config/env.js'

// Tests must behave the same regardless of whatever happens to be in the
// developer's own server/.env - a real GOOGLE_CLIENT_ID there (once Google
// sign-in is actually configured for local development) would otherwise
// silently flip `googleSignIn` to true and break tests that assume it is
// off. tests/google.test.js sets these itself, per test, for the cases that
// actually need them.
delete env.GOOGLE_CLIENT_ID
delete env.GOOGLE_CLIENT_SECRET
// The same for PingMe AI - and here it matters even more: with the real key,
// a test could send real requests to Google. tests/ai.test.js replaces
// services/geminiClient.js with a fake instead, so nothing ever leaves.
delete env.GEMINI_API_KEY
// And push: tests/push.test.js sets its own keys and fakes web-push's
// sending, so no test ever posts to a real push service.
delete env.VAPID_PUBLIC_KEY
delete env.VAPID_PRIVATE_KEY

// Every test run gets a real MongoDB, started in memory and thrown away
// afterwards. Nothing touches the development database.
//
// The first run downloads a MongoDB binary (~100 MB) and needs internet.
// It is cached, so later runs are fast and work offline.
let mongod

beforeAll(async () => {
  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri())
  // Wait for every model's indexes to finish building. The duplicate-username
  // and duplicate-request tests rely on the unique indexes, and would be
  // flaky if the first test ran before they existed.
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()))
}, 120_000) // generous timeout: the first run may be downloading

// Wipe every collection between tests so they cannot affect each other and
// can run in any order.
//
// Every collection in the database, not just the ones with a mongoose model:
// the GridFS collections (uploads.files, uploads.chunks) have no model.
afterEach(async () => {
  for (const collection of await mongoose.connection.db.collections()) {
    await collection.deleteMany({})
  }
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongod.stop()
})
