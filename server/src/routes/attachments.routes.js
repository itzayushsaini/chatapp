import { Router } from 'express'
import { z } from 'zod'

import * as attachments from '../controllers/attachments.controller.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { objectId, validate } from '../middleware/validate.js'

const router = Router()

router.use(requireAuth)

// Every download is checked: only the two people in the conversation get the
// file (see attachmentService.getForDownload).
router.get('/:id', validate({ params: z.object({ id: objectId }) }), attachments.download)

export default router
