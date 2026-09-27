import { Router } from 'express'
import { z } from 'zod'

import * as auth from '../controllers/auth.controller.js'
import { authLimiter, profileLimiter } from '../middleware/rateLimits.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { validate } from '../middleware/validate.js'
import { USERNAME_REGEX } from '../models/User.js'

const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(USERNAME_REGEX, 'must be 3-20 characters: letters, numbers, _ or .'),
  displayName: z.string().trim().min(1, 'is required').max(40, 'must be at most 40 characters'),
  email: z.string().trim().toLowerCase().email('must be a valid email address'),
  // bcrypt only uses the first 72 bytes, so a longer password would silently
  // be cut short. Rejecting it is more honest.
  password: z
    .string()
    .min(8, 'must be at least 8 characters')
    .max(72, 'must be at most 72 characters'),
})

const loginSchema = z.object({
  identifier: z.string().trim().toLowerCase().min(1, 'is required'),
  password: z.string().min(1, 'is required').max(72),
})

// bcrypt only uses the first 72 bytes - shared with registerSchema's rule.
const newPasswordField = z
  .string()
  .min(8, 'must be at least 8 characters')
  .max(72, 'must be at most 72 characters')

const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email('must be a valid email address'),
})

const resetPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email('must be a valid email address'),
  // 32 random bytes, hex-encoded - see authService.requestPasswordReset.
  token: z.string().regex(/^[a-f0-9]{64}$/, 'Invalid or malformed token'),
  password: newPasswordField,
})

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'is required').max(72),
    newPassword: newPasswordField,
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    message: 'New password must be different from your current password',
    path: ['newPassword'],
  })

const router = Router()

router.post('/register', authLimiter, validate({ body: registerSchema }), auth.register)
router.post('/login', authLimiter, validate({ body: loginSchema }), auth.login)
router.post('/logout', auth.logout)
router.get('/me', requireAuth, auth.me)

// Same limiter as register/login: all three are the ways an anonymous
// visitor can act on an account, so all three share one abuse budget.
router.post(
  '/forgot-password',
  authLimiter,
  validate({ body: forgotPasswordSchema }),
  auth.forgotPassword,
)
router.post(
  '/reset-password',
  authLimiter,
  validate({ body: resetPasswordSchema }),
  auth.resetPassword,
)
// Per-user (not per-IP): this is an authenticated action, so IP-based
// limiting would unfairly cap several logged-in users on one network.
router.patch(
  '/password',
  requireAuth,
  profileLimiter,
  validate({ body: changePasswordSchema }),
  auth.changePassword,
)

export default router
