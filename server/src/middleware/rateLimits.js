import rateLimit from 'express-rate-limit'

import { isTest } from '../config/env.js'
import { AppError } from '../utils/AppError.js'

// E2E_DISABLE_RATE_LIMITS is only set by e2e/start-server.js, never in a real deployment
const skip = () =>
  (isTest && process.env.ENABLE_RATE_LIMITS !== 'true') || process.env.E2E_DISABLE_RATE_LIMITS === 'true'

function limiter({ windowMs, limit, message, perUser = false }) {
  return rateLimit({
    windowMs,
    limit,
    skip,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    // Per account, so people sharing one IP (a college network) don't share a limit
    ...(perUser && { keyGenerator: (req) => String(req.user._id) }),
    handler: (req, res, next) => next(new AppError(429, message)),
  })
}

export const authLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: 'Too many attempts, please try again later',
})

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

export const profileLimiter = limiter({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  message: 'Too many profile changes, please try again later',
  perUser: true,
})

export const uploadLimiter = limiter({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  message: 'Too many uploads, please try again later',
  perUser: true,
})

export const aiLimiter = limiter({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  message: 'Too many PingMe AI requests, please slow down',
  perUser: true,
})

export const adminLimiter = limiter({
  windowMs: 60 * 60 * 1000,
  limit: 200,
  message: 'Too many admin actions, please slow down',
  perUser: true,
})
