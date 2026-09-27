import mongoose from 'mongoose'

import { env } from './env.js'

// Reject queries that use fields not declared in a schema, instead of
// silently ignoring them.
mongoose.set('strictQuery', true)

export async function connectDb() {
  await mongoose.connect(env.MONGO_URI)
  console.log('MongoDB connected')
  return mongoose.connection
}

export async function disconnectDb() {
  await mongoose.disconnect()
}
