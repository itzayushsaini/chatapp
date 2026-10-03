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
  // Password-reset email (Brevo). Left optional so the app still starts
  // without it - emailService then logs a warning and skips sending instead
  // of breaking the request, so a missing key never causes a 500 for users.
  BREVO_API_KEY: z.string().optional(),
  EMAIL_FROM_ADDRESS: z.string().email().optional(),
  EMAIL_FROM_NAME: z.string().default('PingMe'),
  // Used to build the link inside password-reset emails. Vite's address in
  // development; set this to the deployed URL in production.
  APP_URL: z.string().url().default('http://localhost:5173'),
  // "Continue with Google". Optional - without both, the button is hidden
  // and /api/auth/google just sends the visitor back to the login page.
  // Google's redirect URI to register is `${APP_URL}/api/auth/google/callback`.
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  // PingMe AI (Google Gemini). Optional - without a key the AI chat is simply
  // not offered. The model names are settings rather than code, because
  // Google renames and retires models every few months.
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().min(1).default('gemini-3.8-flash'),
  // Tried automatically when the main model answers "overloaded" (503) -
  // common on Gemini's free tier at busy times. A different model has its
  // own capacity, so the question usually still gets an answer.
  GEMINI_FALLBACK_MODEL: z.string().default('gemini-3.5-flash'),
  // Only used when an admin switches on image creation (paid plans only).
  GEMINI_IMAGE_MODEL: z.string().min(1).default('gemini-3.1-flash-image'),
  // Web Push: notifications that arrive even when PingMe is closed.
  // Optional - without both keys, notifications only arrive while the app is
  // open (as before). Make a pair once with: npx web-push generate-vapid-keys
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  // Who the push services can contact about our pushes: an https: or
  // mailto: address. Defaults to APP_URL when that is https (it is on Render).
  VAPID_SUBJECT: z
    .string()
    .regex(/^(https:|mailto:)/, 'must start with https: or mailto:')
    .optional(),
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
