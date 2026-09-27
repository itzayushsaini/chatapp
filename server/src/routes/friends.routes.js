import { Router } from 'express'
import { z } from 'zod'

import * as friends from '../controllers/friends.controller.js'
import { friendRequestLimiter } from '../middleware/rateLimits.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { objectId, validate } from '../middleware/validate.js'
import { usernameInput } from './users.routes.js'

const requestIdParams = validate({ params: z.object({ id: objectId }) })

const router = Router()

router.use(requireAuth)

// /requests routes come before /:userId so "requests" is never mistaken for a
// user id.
router.get('/requests', friends.listRequests)
router.post(
  '/requests',
  friendRequestLimiter,
  validate({ body: z.object({ username: usernameInput }) }),
  friends.sendRequest,
)
router.post('/requests/:id/accept', requestIdParams, friends.accept)
router.post('/requests/:id/decline', requestIdParams, friends.decline)
router.delete('/requests/:id', requestIdParams, friends.cancel)

router.get('/', friends.list)
router.delete('/:userId', validate({ params: z.object({ userId: objectId }) }), friends.unfriend)

export default router
