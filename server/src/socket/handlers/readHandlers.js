import { z } from 'zod'

import { objectId } from '../../middleware/validate.js'
import { markRead } from '../../services/messageService.js'
import { AppError } from '../../utils/AppError.js'

const readSchema = z.object({
  conversationId: objectId,
  upToMessageId: objectId,
})

const RATE_LIMIT = 20
const RATE_WINDOW_MS = 5000

// Its own limit: this event fires automatically, not from a user click
function createRateLimiter() {
  let sentAt = []
  return () => {
    const now = Date.now()
    sentAt = sentAt.filter((t) => now - t < RATE_WINDOW_MS)
    if (sentAt.length >= RATE_LIMIT) return false
    sentAt.push(now)
    return true
  }
}

export function registerReadHandlers(socket) {
  const { userId } = socket.data
  const allow = createRateLimiter()

  socket.on('conversation:read', async (payload, ack) => {
    const reply = (result) => {
      if (typeof ack === 'function') ack(result)
    }

    try {
      if (!allow()) return reply({ ok: false })
      const parsed = readSchema.safeParse(payload)
      if (!parsed.success) return reply({ ok: false })

      const otherId = await markRead(userId, parsed.data.conversationId, parsed.data.upToMessageId)

      // null means the pointer did not move forward
      if (otherId) {
        socket.to(`user:${otherId}`).emit('message:read', {
          conversationId: parsed.data.conversationId,
          upToMessageId: parsed.data.upToMessageId,
        })
      }
      reply({ ok: true })
    } catch (err) {
      if (!(err instanceof AppError)) console.error('conversation:read failed:', err)
      reply({ ok: false })
    }
  })
}
