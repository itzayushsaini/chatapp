import { Router } from 'express'
import { z } from 'zod'

import * as ai from '../controllers/ai.controller.js'
import { aiLimiter, profileLimiter } from '../middleware/rateLimits.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { singleFile, voiceNoteFields } from '../middleware/upload.js'
import { objectId, validate } from '../middleware/validate.js'
import { AI_TEXT_MAX } from '../models/AiMessage.js'
import { AI_FILE_MAX_BYTES } from '../services/aiService.js'

const clientId = z.string().uuid('Invalid clientId')

const askFields = z.object({
  text: z.string().trim().max(AI_TEXT_MAX, `must be at most ${AI_TEXT_MAX} characters`).default(''),
  clientId,
  mode: z.enum(['chat', 'think', 'imagine']).default('chat'),
  ...voiceNoteFields,
})

const router = Router()

router.use(requireAuth)

router.get('/summary', ai.summary)
router.get(
  '/messages',
  validate({
    query: z.object({
      before: objectId.optional(),
      limit: z.coerce.number().int().min(1).max(50).default(30),
    }),
  }),
  ai.history,
)

// Check the user may ask right now before multer reads any file
router.post(
  '/messages',
  aiLimiter,
  ai.checkCanAsk,
  singleFile('file', AI_FILE_MAX_BYTES, { optional: true }),
  validate({ body: askFields }),
  ai.ask,
)
router.post('/forward', aiLimiter, validate({ body: z.object({ messageId: objectId, clientId }) }), ai.forward)
router.post('/retry', aiLimiter, ai.retry)
router.post('/stop', ai.stop)
router.delete('/messages', profileLimiter, ai.clear)
router.get('/files/:id', validate({ params: z.object({ id: objectId }) }), ai.file)

export default router
