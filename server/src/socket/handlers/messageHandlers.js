import { z } from 'zod'

import { objectId } from '../../middleware/validate.js'
import { sendMessage } from '../../services/messageService.js'
import { AppError } from '../../utils/AppError.js'

// text may be empty when there is an attachment (a photo with no caption),
// but a message must have one or the other.
const sendSchema = z
  .object({
    conversationId: objectId,
    text: z.string().trim().max(2000, 'Message is too long').default(''),
    clientId: z.string().uuid('Invalid clientId'),
    attachmentId: objectId.optional(),
  })
  .refine((m) => m.text.length > 0 || m.attachmentId, { message: 'Message is empty' })

const RATE_LIMIT = 10
const RATE_WINDOW_MS = 5000

// A sliding window per socket: remember when the last messages were sent and
// refuse if there were already 10 in the last 5 seconds. Small enough to
// keep here rather than adding a library.
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

export function registerMessageHandlers(socket) {
  const { userId } = socket.data
  const allow = createRateLimiter()

  // The ONLY way to send a message. The order is mandatory:
  //   validate -> assertParticipant -> assertFriends ->
  //   save (claiming the attachment, if any) -> update lastMessage ->
  //   emit -> ack
  // Steps 2-5 are inside messageService.sendMessage. If anything fails
  // before the save, nothing is emitted, so a message can never appear on
  // someone's screen without being stored.
  socket.on('message:send', async (payload, ack) => {
    // Without a callback the client cannot learn the result; ignore it rather
    // than crash on ack(...) below.
    if (typeof ack !== 'function') return

    try {
      if (!allow()) return ack({ ok: false, error: 'Slow down' })

      const parsed = sendSchema.safeParse(payload)
      if (!parsed.success) return ack({ ok: false, error: parsed.error.issues[0].message })

      const { message, otherId, created } = await sendMessage(userId, parsed.data)

      // Reaches the recipient's tabs and MY other tabs, but not this tab -
      // this tab gets the message back in the ack instead. A retry of an
      // already-saved message is not emitted again.
      if (created) {
        socket.to(`user:${otherId}`).to(`user:${userId}`).emit('message:new', message)
      }

      ack({ ok: true, message })
    } catch (err) {
      // An AppError (403 not friends, 404 conversation) is safe to show. Any
      // other error is a bug: log it, but give the client a generic message.
      if (!(err instanceof AppError)) console.error('message:send failed:', err)
      ack({ ok: false, error: err instanceof AppError ? err.message : 'Could not send message' })
    }
  })
}
