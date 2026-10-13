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
  limit: z.coerce.number().int().min(1).max(50).default(30),
})

const conversationParams = validate({ params: z.object({ id: objectId }) })

const uploadFields = z.object(voiceNoteFields)

const router = Router()

router.use(requireAuth)

router.get(
  '/:id/messages',
  validate({ params: z.object({ id: objectId }), query: historyQuery }),
  conversations.messages,
)

// Order matters: check the user may upload here before multer reads the file
router.post(
  '/:id/attachments',
  uploadLimiter,
  conversationParams,
  conversations.checkCanUpload,
  singleFile('file', UPLOAD_MAX_BYTES),
  validate({ body: uploadFields }),
  conversations.upload,
)

router.get('/:id/attachments', conversationParams, conversations.sharedAttachments)
router.post('/:id/clear', profileLimiter, conversationParams, conversations.clear)
router.patch(
  '/:id/mute',
  profileLimiter,
  validate({ params: z.object({ id: objectId }), body: z.object({ muted: z.boolean() }) }),
  conversations.mute,
)

export default router
