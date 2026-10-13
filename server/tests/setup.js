import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { afterAll, afterEach, beforeAll } from 'vitest'

import { env } from '../src/config/env.js'

// ignore keys from the developer's server/.env, so no test can reach Google or a push service
delete env.GOOGLE_CLIENT_ID
delete env.GOOGLE_CLIENT_SECRET
delete env.GEMINI_API_KEY
delete env.VAPID_PUBLIC_KEY
delete env.VAPID_PRIVATE_KEY

// the first run downloads a MongoDB binary (~100 MB), hence the long timeout
let mongod

beforeAll(async () => {
  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri())
  // the duplicate tests rely on the unique indexes, so wait until they are built
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()))
}, 120_000)

// every collection, including the GridFS ones that have no model
afterEach(async () => {
  for (const collection of await mongoose.connection.db.collections()) {
    await collection.deleteMany({})
  }
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongod.stop()
})
