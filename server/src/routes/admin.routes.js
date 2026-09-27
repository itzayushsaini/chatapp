import { Router } from 'express'
import { z } from 'zod'

import * as admin from '../controllers/admin.controller.js'
import { adminLimiter } from '../middleware/rateLimits.js'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { objectId, validate } from '../middleware/validate.js'

const domain = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/, 'must be a domain like gmail.com')

const settingsSchema = z.object({
  allowedEmailDomains: z.array(domain).min(1, 'at least one domain is required').max(20).optional(),
  registrationOpen: z.boolean().optional(),
  attachmentsEnabled: z.boolean().optional(),
  forwardingEnabled: z.boolean().optional(),
  deleteForEveryoneWindowMinutes: z.coerce.number().int().min(1).max(10080).optional(),
  announcement: z
    .object({
      enabled: z.boolean().optional(),
      text: z.string().trim().max(200, 'must be at most 200 characters').optional(),
    })
    .optional(),
})

const userIdParams = validate({ params: z.object({ userId: objectId }) })

const listUsersQuery = validate({
  query: z.object({
    search: z.string().trim().max(100).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
})

const router = Router()

// Every route here needs a real, logged-in isAdmin account - there is no
// partial or read-only tier.
router.use(requireAuth, requireAdmin)

router.get('/settings', admin.getSettingsController)
router.patch('/settings', adminLimiter, validate({ body: settingsSchema }), admin.updateSettingsController)

router.get('/users', listUsersQuery, admin.listUsers)
router.patch('/users/:userId/suspend', adminLimiter, userIdParams, admin.suspendUser)
router.patch('/users/:userId/unsuspend', adminLimiter, userIdParams, admin.unsuspendUser)
router.delete('/users/:userId', adminLimiter, userIdParams, admin.deleteUser)

router.get('/stats', admin.getStats)

export default router
