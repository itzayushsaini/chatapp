import { Router } from 'express'
import { z } from 'zod'

import * as push from '../controllers/push.controller.js'
import { profileLimiter } from '../middleware/rateLimits.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { validate } from '../middleware/validate.js'
import { isPushServiceUrl } from '../services/pushService.js'

// The endpoint must be a real browser push service - otherwise someone could
// make our server send requests to any address they like (see pushService).
const endpoint = z
  .string()
  .max(2048)
  .refine(isPushServiceUrl, "must be a browser push service's https address")

// The browser's own keys for this subscription, base64url-encoded.
const base64url = z.string().regex(/^[A-Za-z0-9_-]+={0,2}$/, 'must be base64url').max(200)

const router = Router()

router.use(requireAuth)

router.get('/key', push.key)
// Subscribing happens once per device per login, so the generous profile
// budget is plenty.
router.post(
  '/subscriptions',
  profileLimiter,
  validate({ body: z.object({ endpoint, keys: z.object({ p256dh: base64url, auth: base64url }) }) }),
  push.subscribe,
)
router.delete('/subscriptions', profileLimiter, validate({ body: z.object({ endpoint }) }), push.unsubscribe)

export default router
