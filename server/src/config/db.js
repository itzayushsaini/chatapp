import mongoose from 'mongoose'

import { env } from './env.js'

mongoose.set('strictQuery', true)

export async function connectDb() {
  await mongoose.connect(env.MONGO_URI)
  console.log('MongoDB connected')
  return mongoose.connection
}

export async function disconnectDb() {
  await mongoose.disconnect()
}
