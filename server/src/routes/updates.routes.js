import { Router } from 'express'
import { z } from 'zod'

import * as updates from '../controllers/updates.controller.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { objectId, validate } from '../middleware/validate.js'

// Reading the "PingMe" updates channel - any logged-in user. Posting and
// deleting are admin routes (see admin.routes.js).
const router = Router()

router.use(requireAuth)

router.get('/summary', updates.summary)
router.get(
  '/',
  validate({
    query: z.object({
      before: objectId.optional(),
      limit: z.coerce.number().int().min(1).max(50).default(20),
    }),
  }),
  updates.list,
)
router.post('/read', validate({ body: z.object({ upToId: objectId }) }), updates.markRead)
router.get('/:id/image', validate({ params: z.object({ id: objectId }) }), updates.image)

export default router
