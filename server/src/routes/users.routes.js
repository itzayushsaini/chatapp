import { Router } from 'express'
import { z } from 'zod'

import * as users from '../controllers/users.controller.js'
import { profileLimiter, searchLimiter } from '../middleware/rateLimits.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { singleFile } from '../middleware/upload.js'
import { objectId, validate } from '../middleware/validate.js'
import { BIO_MAX_LENGTH, USERNAME_REGEX } from '../models/User.js'

// Normalised the same way as at registration, so "Aman " finds "aman".
export const usernameInput = z.string().trim().toLowerCase().min(1, 'is required').max(20)

// The browser crops pictures to 256x256 before uploading, so real uploads
// are tiny. This limit only stops someone skipping the browser.
const AVATAR_MAX_BYTES = 2 * 1024 * 1024

// Every field is optional: send only what changed. Unknown fields (email,
// password...) are stripped by zod and can never be changed through here.
const profileSchema = z.object({
  displayName: z.string().trim().min(1, 'is required').max(40, 'must be at most 40 characters').optional(),
  bio: z.string().trim().max(BIO_MAX_LENGTH, `must be at most ${BIO_MAX_LENGTH} characters`).optional(),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(USERNAME_REGEX, 'must be 3-20 characters: letters, numbers, _ or .')
    .optional(),
})

const router = Router()

router.use(requireAuth)

router.get(
  '/search',
  searchLimiter,
  validate({ query: z.object({ username: usernameInput }) }),
  users.search,
)

router.patch('/me', profileLimiter, validate({ body: profileSchema }), users.updateMe)
router.put('/me/avatar', profileLimiter, singleFile('avatar', AVATAR_MAX_BYTES), users.setAvatar)
router.delete('/me/avatar', profileLimiter, users.removeAvatar)

router.get(
  '/:id/avatar',
  validate({ params: z.object({ id: objectId }), query: z.object({ v: z.string().optional() }) }),
  users.avatar,
)

export default router
