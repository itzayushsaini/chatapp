import { z } from 'zod'

import { objectId } from '../../middleware/validate.js'
import {
  deleteMessage,
  forwardMessage,
  markDelivered,
  sendMessage,
} from '../../services/messageService.js'
import { isOnline } from '../../services/presenceService.js'
import { notifyNewMessage } from '../../services/pushService.js'
import { AppError } from '../../utils/AppError.js'
import { emitToUser } from '../emitter.js'

// Own try/catch: this runs after the ack, so a failure must not cause a second ack
async function announceDeliveredIfOnline(senderId, recipientId, conversationId, messageId) {
  try {
    if (!isOnline(recipientId)) return
    if (await markDelivered(recipientId, conversationId, messageId)) {
      emitToUser(senderId, 'message:delivered', { conversationId, upToMessageId: messageId })
    }
  } catch (err) {
    console.error('marking delivered failed:', err)
  }
}

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

const forwardSchema = z.object({
  messageId: objectId,
  toConversationIds: z.array(objectId).min(1, 'Choose at least one chat').max(20, 'Too many chats at once'),
})

const RATE_LIMIT = 10
const RATE_WINDOW_MS = 5000

const ACTION_RATE_LIMIT = 20
const ACTION_RATE_WINDOW_MS = 5000

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

  // Order matters: nothing is emitted until sendMessage has checked and saved it,
  // so a message never appears on screen without being stored
  socket.on('message:send', async (payload, ack) => {
    if (typeof ack !== 'function') return

    try {
      if (!allow()) return ack({ ok: false, error: 'Slow down' })

      const parsed = sendSchema.safeParse(payload)
      if (!parsed.success) return ack({ ok: false, error: parsed.error.issues[0].message })

      const { message, otherId, created } = await sendMessage(userId, parsed.data)

      // Not to this tab, which gets the ack instead; a retried send isn't emitted again
      if (created) {
        socket.to(`user:${otherId}`).to(`user:${userId}`).emit('message:new', message)
      }

      ack({ ok: true, message })
      if (created) {
        await announceDeliveredIfOnline(userId, otherId, message.conversationId, message.id)
        notifyNewMessage(otherId, message)
      }
    } catch (err) {
      if (!(err instanceof AppError)) console.error('message:send failed:', err)
      ack({ ok: false, error: err instanceof AppError ? err.message : 'Could not send message' })
    }
  })

  socket.on('message:delete', async (payload, ack) => {
    if (typeof ack !== 'function') return

    try {
      if (!allowAction()) return ack({ ok: false, error: 'Slow down' })

      const parsed = deleteSchema.safeParse(payload)
      if (!parsed.success) return ack({ ok: false, error: parsed.error.issues[0].message })

      const { otherId, mode, lastMessage } = await deleteMessage(userId, parsed.data)
      const event = { conversationId: parsed.data.conversationId, messageId: parsed.data.messageId, mode }
      // Only sent when the preview changed: missing means "no change", not null
      if (lastMessage !== undefined) event.lastMessage = lastMessage

      if (mode === 'everyone') {
        socket.to(`user:${otherId}`).to(`user:${userId}`).emit('message:deleted', event)
      } else {
        socket.to(`user:${userId}`).emit('message:deleted', event)
      }

      ack({ ok: true, ...event })
    } catch (err) {
      if (!(err instanceof AppError)) console.error('message:delete failed:', err)
      ack({ ok: false, error: err instanceof AppError ? err.message : 'Could not delete message' })
    }
  })

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

      for (const result of results) {
        if (result.ok) {
          await announceDeliveredIfOnline(userId, result.otherId, result.conversationId, result.message.id)
          notifyNewMessage(result.otherId, result.message)
        }
      }
    } catch (err) {
      if (!(err instanceof AppError)) console.error('message:forward failed:', err)
      ack({ ok: false, error: err instanceof AppError ? err.message : 'Could not forward message' })
    }
  })
}
