import { catchUpDelivered } from '../../services/messageService.js'
import { emitToUser } from '../emitter.js'

// Runs on every connection, but the pointer only moves forward, so repeats announce nothing
export async function registerDeliveryHandlers(socket) {
  const { userId } = socket.data
  try {
    for (const { senderId, conversationId, upToMessageId } of await catchUpDelivered(userId)) {
      emitToUser(senderId, 'message:delivered', { conversationId, upToMessageId })
    }
  } catch (err) {
    console.error('delivery catch-up failed:', err.message)
  }
}
