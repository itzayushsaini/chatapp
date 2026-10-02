import rateLimit from 'express-rate-limit'

import { isTest } from '../config/env.js'
import { AppError } from '../utils/AppError.js'

// Every automated test comes from the same address, so with the real limits
// the test suite would lock itself out after ten registrations. Limits are
// therefore off under NODE_ENV=test, except in tests/rateLimits.test.js,
// which switches them back on to prove they work. This can never be switched
// off in development or production.
//
// The end-to-end suite is a separate case: it deliberately runs the real
// production server (NODE_ENV=production, to test the exact deployed
// behaviour), but every spec file shares that one process and one IP for
// the whole run, so their combined, entirely legitimate register/login
// calls would trip a limit meant to catch abuse from a single caller.
// e2e/start-server.js is the only place that sets this flag - a real
// deployment never does.
const skip = () =>
  (isTest && process.env.ENABLE_RATE_LIMITS !== 'true') || process.env.E2E_DISABLE_RATE_LIMITS === 'true'

function limiter({ windowMs, limit, message, perUser = false }) {
  return rateLimit({
    windowMs,
    limit,
    skip,
    standardHeaders: 'draft-8', // tells the client when it may retry
    legacyHeaders: false,
    // Per-user limits count by account, so users behind one shared IP (a
    // college network) do not use up each other's allowance. These run after
    // requireAuth, so req.user is always set.
    ...(perUser && { keyGenerator: (req) => String(req.user._id) }),
    // Hand over to the central error handler so the body is { message }.
    handler: (req, res, next) => next(new AppError(429, message)),
  })
}

// Per IP: slows down password guessing and mass sign-ups.
export const authLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: 'Too many attempts, please try again later',
})

// Per user: exact-match search already stops listing users, and this stops
// guessing usernames at speed.
export const searchLimiter = limiter({
  windowMs: 60 * 1000,
  limit: 30,
  message: 'Too many searches, please slow down',
  perUser: true,
})

export const friendRequestLimiter = limiter({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  message: 'Too many friend requests, please try again later',
  perUser: true,
})

// Per user: profile edits and picture uploads. Generous for real use, but
// stops a script from churning names or filling storage.
export const profileLimiter = limiter({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  message: 'Too many profile changes, please try again later',
  perUser: true,
})

// Per user: chat attachments. Uploads are the most expensive thing a client
// can ask for (memory while checking, database storage after).
export const uploadLimiter = limiter({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  message: 'Too many uploads, please try again later',
  perUser: true,
})

// Per user: questions to PingMe AI. The admin's daily limit is the real cap;
// this only stops a script from firing a burst of questions.
export const aiLimiter = limiter({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  message: 'Too many PingMe AI requests, please slow down',
  perUser: true,
})

// Per user: admin actions (settings changes, suspend/unsuspend/delete).
// requireAdmin is the real gate - this just stops a mis-click loop or a
// runaway script from hammering the database, generous since there is
// normally only one admin account using it.
export const adminLimiter = limiter({
  windowMs: 60 * 60 * 1000,
  limit: 200,
  message: 'Too many admin actions, please slow down',
  perUser: true,
})
