import { Router } from 'express'
import { z } from 'zod'

import * as conversations from '../controllers/conversations.controller.js'
import { profileLimiter, uploadLimiter } from '../middleware/rateLimits.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { singleFile, voiceNoteFields } from '../middleware/upload.js'
import { objectId, validate } from '../middleware/validate.js'
import { UPLOAD_MAX_BYTES } from '../services/attachmentService.js'

const historyQuery = z.object({
  before: objectId.optional(),
  // Query strings are always text, so coerce "30" to 30. Capped at 50 so one
  // request can never ask for the whole history.
  limit: z.coerce.number().int().min(1).max(50).default(30),
})

const conversationParams = validate({ params: z.object({ id: objectId }) })

// The text fields a voice note is uploaded with - see middleware/upload.js.
const uploadFields = z.object(voiceNoteFields)

const router = Router()

router.use(requireAuth)

router.get(
  '/:id/messages',
  validate({ params: z.object({ id: objectId }), query: historyQuery }),
  conversations.messages,
)

// Step 1 of sending a file (step 2 is message:send with the attachmentId).
// The order matters: rate limit -> valid id -> may I upload here? -> only
// then read the file (and its text fields, which arrive with it).
router.post(
  '/:id/attachments',
  uploadLimiter,
  conversationParams,
  conversations.checkCanUpload,
  singleFile('file', UPLOAD_MAX_BYTES),
  validate({ body: uploadFields }),
  conversations.upload,
)

// The contact info panel. Clearing and muting are per-user preferences with
// the same generous per-user budget as profile edits.
router.get('/:id/attachments', conversationParams, conversations.sharedAttachments)
router.post('/:id/clear', profileLimiter, conversationParams, conversations.clear)
router.patch(
  '/:id/mute',
  profileLimiter,
  validate({ params: z.object({ id: objectId }), body: z.object({ muted: z.boolean() }) }),
  conversations.mute,
)

export default router
