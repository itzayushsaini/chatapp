import path from 'node:path'
import { fileURLToPath } from 'node:url'

import dotenv from 'dotenv'
import { z } from 'zod'

// npm scripts can be run from the repo root or from server/, so resolve .env
// relative to this file rather than relative to the current directory.
const thisDir = path.dirname(fileURLToPath(import.meta.url))
const envFile = path.resolve(thisDir, '../../.env')

// dotenv never overwrites a variable that is already set, so real environment
// variables (used in production and in tests) always win over the file.
dotenv.config({ path: envFile, quiet: true })

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(5000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  MONGO_URI: z.string().min(1, 'is required (a MongoDB connection string)'),
  JWT_SECRET: z.string().min(32, 'must be at least 32 characters'),
  SENTRY_DSN: z.string().optional(),
})

const result = envSchema.safeParse(process.env)

if (!result.success) {
  // Print the failing variable NAMES and rules only. The values are secrets,
  // so they must never be logged.
  console.error('\nInvalid environment. Check server/.env against server/.env.example:')
  for (const issue of result.error.issues) {
    console.error(`  - ${issue.path.join('.')} ${issue.message}`)
  }
  console.error('')
  process.exit(1)
}

export const env = result.data
export const isProduction = env.NODE_ENV === 'production'
export const isTest = env.NODE_ENV === 'test'
