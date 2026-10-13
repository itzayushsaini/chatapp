import { Router } from 'express'
import { z } from 'zod'

import * as users from '../controllers/users.controller.js'
import { profileLimiter, searchLimiter } from '../middleware/rateLimits.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { singleFile } from '../middleware/upload.js'
import { objectId, validate } from '../middleware/validate.js'
import { BIO_MAX_LENGTH, USERNAME_REGEX } from '../models/User.js'

export const usernameInput = z.string().trim().toLowerCase().min(1, 'is required').max(20)

const AVATAR_MAX_BYTES = 2 * 1024 * 1024

// zod strips unknown fields, so email and password can't be changed here
const profileSchema = z.object({
  displayName: z.string().trim().min(1, 'is required').max(40, 'must be at most 40 characters').optional(),
  bio: z.string().trim().max(BIO_MAX_LENGTH, `must be at most ${BIO_MAX_LENGTH} characters`).optional(),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(USERNAME_REGEX, 'must be 3-20 characters: letters, numbers, _ or .')
    .optional(),
  theme: z.enum(['light', 'dark', 'system']).optional(),
})

const router = Router()

router.use(requireAuth)

router.get(
  '/search',
  searchLimiter,
  validate({ query: z.object({ username: usernameInput }) }),
  users.search,
)

// At least 3 characters, so one letter can't list everyone
router.get(
  '/find',
  searchLimiter,
  validate({ query: z.object({ q: z.string().trim().min(3, 'type at least 3 characters').max(40) }) }),
  users.find,
)

router.patch('/me', profileLimiter, validate({ body: profileSchema }), users.updateMe)

// Before /:id routes, so "me" is never read as a user id
router.get('/me/blocked', users.blocked)
router.post('/:id/block', profileLimiter, validate({ params: z.object({ id: objectId }) }), users.block)
router.delete('/:id/block', profileLimiter, validate({ params: z.object({ id: objectId }) }), users.unblock)
router.put('/me/avatar', profileLimiter, singleFile('avatar', AVATAR_MAX_BYTES), users.setAvatar)
router.delete('/me/avatar', profileLimiter, users.removeAvatar)

router.get(
  '/:id/avatar',
  validate({ params: z.object({ id: objectId }), query: z.object({ v: z.string().optional() }) }),
  users.avatar,
)

export default router
