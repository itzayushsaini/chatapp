import { z } from 'zod'

import { objectId } from '../../middleware/validate.js'
import { deleteMessage, forwardMessage, sendMessage } from '../../services/messageService.js'
import { AppError } from '../../utils/AppError.js'

// text may be empty when there is an attachment (a photo with no caption),
// but a message must have one or the other.
const sendSchema = z
  .object({
    conversationId: objectId,
    text: z.string().trim().max(2000, 'Message is too long').default(''),
    clientId: z.string().uuid('Invalid clientId'),
    attachmentId: objectId.optional(),
    replyToId: objectId.optional(),
  })
  .refine((m) => m.text.length > 0 || m.attachmentId, { message: 'Message is empty' })

const deleteSchema = z.object({
  conversationId: objectId,
  messageId: objectId,
  mode: z.enum(['me', 'everyone']),
})

// Forwarding to more than this in one go is not a real use case here - it's
// a cap against abuse, not a feature limit anyone would notice.
const forwardSchema = z.object({
  messageId: objectId,
  toConversationIds: z.array(objectId).min(1, 'Choose at least one chat').max(20, 'Too many chats at once'),
})

const RATE_LIMIT = 10
const RATE_WINDOW_MS = 5000

// Delete and forward are user-initiated clicks, not automatic events, so they
// share message:send's own budget rather than getting a separate counter.
const ACTION_RATE_LIMIT = 20
const ACTION_RATE_WINDOW_MS = 5000

// A sliding window per socket: remember when the last actions happened and
// refuse if there were already `limit` in the last `windowMs`. Small enough
// to keep here rather than adding a library.
function createRateLimiter(limit, windowMs) {
  let sentAt = []
  return () => {
    const now = Date.now()
    sentAt = sentAt.filter((t) => now - t < windowMs)
    if (sentAt.length >= limit) return false
    sentAt.push(now)
    return true
  }
}

export function registerMessageHandlers(socket) {
  const { userId } = socket.data
  const allow = createRateLimiter(RATE_LIMIT, RATE_WINDOW_MS)
  const allowAction = createRateLimiter(ACTION_RATE_LIMIT, ACTION_RATE_WINDOW_MS)

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

  // "Delete for me" hides it on my own devices only, so only my own room is
  // told. "Delete for everyone" soft-deletes it for both, so both rooms are
  // told (the same "other room + my own room" pattern as message:send).
  socket.on('message:delete', async (payload, ack) => {
    if (typeof ack !== 'function') return

    try {
      if (!allowAction()) return ack({ ok: false, error: 'Slow down' })

      const parsed = deleteSchema.safeParse(payload)
      if (!parsed.success) return ack({ ok: false, error: parsed.error.issues[0].message })

      const { otherId, mode, lastMessage } = await deleteMessage(userId, parsed.data)
      const event = { conversationId: parsed.data.conversationId, messageId: parsed.data.messageId, mode }
      // Only present when the sidebar preview actually changed (the deleted
      // message WAS the preview) - its absence means "nothing to update",
      // which is different from "cleared to null".
      if (lastMessage !== undefined) event.lastMessage = lastMessage

      if (mode === 'everyone') {
        socket.to(`user:${otherId}`).to(`user:${userId}`).emit('message:deleted', event)
      } else {
        socket.to(`user:${userId}`).emit('message:deleted', event)
      }

      // Echoed back to the tab that asked, the same shape as the broadcast -
      // that tab is excluded from socket.to(...) above (see message:send).
      ack({ ok: true, ...event })
    } catch (err) {
      if (!(err instanceof AppError)) console.error('message:delete failed:', err)
      ack({ ok: false, error: err instanceof AppError ? err.message : 'Could not delete message' })
    }
  })

  // Forwards to several chats at once. Each target is independent, so the ack
  // carries one result per target rather than failing the whole batch for
  // one bad recipient (e.g. one that unfriended me since).
  socket.on('message:forward', async (payload, ack) => {
    if (typeof ack !== 'function') return

    try {
      if (!allowAction()) return ack({ ok: false, error: 'Slow down' })

      const parsed = forwardSchema.safeParse(payload)
      if (!parsed.success) return ack({ ok: false, error: parsed.error.issues[0].message })

      const results = await forwardMessage(userId, parsed.data)

      for (const result of results) {
        if (result.ok) {
          socket.to(`user:${result.otherId}`).to(`user:${userId}`).emit('message:new', result.message)
        }
      }

      ack({
        ok: true,
        results: results.map(({ conversationId, ok, message, error }) => ({
          conversationId,
          ok,
          message,
          error,
        })),
      })
    } catch (err) {
      if (!(err instanceof AppError)) console.error('message:forward failed:', err)
      ack({ ok: false, error: err instanceof AppError ? err.message : 'Could not forward message' })
    }
  })
}
