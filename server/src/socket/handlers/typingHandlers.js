import { z } from 'zod'

import { objectId } from '../../middleware/validate.js'
import { assertFriends, assertParticipant } from '../../services/friendService.js'
import { AppError } from '../../utils/AppError.js'

const typingSchema = z.object({
  conversationId: objectId,
  isTyping: z.boolean(),
})

// The client already throttles typing; this only caps a misbehaving client
const RATE_LIMIT = 30
const RATE_WINDOW_MS = 5000

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

// Never stored and no ack: a lost event just times out on the other side
export function registerTypingHandlers(socket) {
  const { userId } = socket.data
  const allow = createRateLimiter()

  socket.on('typing', async (payload) => {
    try {
      if (!allow()) return
      const parsed = typingSchema.safeParse(payload)
      if (!parsed.success) return

      const { conversationId, isTyping } = parsed.data
      const conversation = await assertParticipant(conversationId, userId)
      const otherId = String(conversation.participants.find((p) => String(p) !== String(userId)))
      await assertFriends(userId, otherId)

      socket.to(`user:${otherId}`).emit('typing', { conversationId, userId, isTyping })
    } catch (err) {
      if (!(err instanceof AppError)) console.error('typing failed:', err)
    }
  })
}
