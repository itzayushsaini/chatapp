import path from 'node:path'
import { fileURLToPath } from 'node:url'

import dotenv from 'dotenv'
import { z } from 'zod'

// Relative to this file, so scripts work from the repo root or from server/
const thisDir = path.dirname(fileURLToPath(import.meta.url))
const envFile = path.resolve(thisDir, '../../.env')

// dotenv never overwrites, so real environment variables win over the file
dotenv.config({ path: envFile, quiet: true })

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(5000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  MONGO_URI: z.string().min(1, 'is required (a MongoDB connection string)'),
  JWT_SECRET: z.string().min(32, 'must be at least 32 characters'),
  SENTRY_DSN: z.string().optional(),
  BREVO_API_KEY: z.string().optional(),
  EMAIL_FROM_ADDRESS: z.string().email().optional(),
  EMAIL_FROM_NAME: z.string().default('PingMe'),
  APP_URL: z.string().url().default('http://localhost:5173'),
  // Google redirect URI to register: ${APP_URL}/api/auth/google/callback
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().min(1).default('gemini-3.8-flash'),
  // Tried when the main model is overloaded (503), common on the free tier
  GEMINI_FALLBACK_MODEL: z.string().default('gemini-3.5-flash'),
  GEMINI_IMAGE_MODEL: z.string().min(1).default('gemini-3.1-flash-image'),
  // Make a pair once with: npx web-push generate-vapid-keys
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  // Defaults to APP_URL when that is https
  VAPID_SUBJECT: z
    .string()
    .regex(/^(https:|mailto:)/, 'must start with https: or mailto:')
    .optional(),
})

const result = envSchema.safeParse(process.env)

if (!result.success) {
  // Names only, never values - they are secrets
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
