import { Router } from 'express'
import { z } from 'zod'

import * as conversations from '../controllers/conversations.controller.js'
import { uploadLimiter } from '../middleware/rateLimits.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { singleFile } from '../middleware/upload.js'
import { objectId, validate } from '../middleware/validate.js'
import { UPLOAD_MAX_BYTES } from '../services/attachmentService.js'

const historyQuery = z.object({
  before: objectId.optional(),
  // Query strings are always text, so coerce "30" to 30. Capped at 50 so one
  // request can never ask for the whole history.
  limit: z.coerce.number().int().min(1).max(50).default(30),
})

const conversationParams = validate({ params: z.object({ id: objectId }) })

const router = Router()

router.use(requireAuth)

router.get(
  '/:id/messages',
  validate({ params: z.object({ id: objectId }), query: historyQuery }),
  conversations.messages,
)

// Step 1 of sending a file (step 2 is message:send with the attachmentId).
// The order matters: rate limit -> valid id -> may I upload here? -> only
// then read the file.
router.post(
  '/:id/attachments',
  uploadLimiter,
  conversationParams,
  conversations.checkCanUpload,
  singleFile('file', UPLOAD_MAX_BYTES),
  conversations.upload,
)

export default router
