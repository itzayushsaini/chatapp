import { catchUpDelivered } from '../../services/messageService.js'
import { emitToUser } from '../emitter.js'

// When a user comes online, every message already waiting for them has now
// reached their app - so each sender gets the grey double tick for it. A
// message sent while they are ALREADY online is handled at send time
// instead (see announceDeliveredIfOnline in messageHandlers.js).
//
// Runs on every connection (each tab, each reconnect), but the pointer only
// ever moves forward, so a repeat connection announces nothing new.
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
