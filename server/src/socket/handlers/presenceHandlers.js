import { User } from '../../models/User.js'
import { getFriendIds } from '../../services/friendService.js'
import { addConnection, isOnline, removeConnection } from '../../services/presenceService.js'
import { emitToUser } from '../emitter.js'

export async function registerPresenceHandlers(socket) {
  const { userId } = socket.data

  // Registered first, so a disconnect during the lookups below is not missed
  socket.on('disconnect', async () => {
    try {
      // Only the last tab closing makes the user offline
      if (removeConnection(userId) > 0) return

      const lastSeen = new Date()
      await User.updateOne({ _id: userId }, { lastSeen })

      // They may have reconnected while we were saving
      if (isOnline(userId)) return
      for (const friendId of await getFriendIds(userId)) {
        emitToUser(friendId, 'presence:update', { userId, online: false, lastSeen })
      }
    } catch (err) {
      console.error('presence disconnect failed:', err.message)
    }
  })

  try {
    const count = addConnection(userId)
    const friendIds = await getFriendIds(userId)

    if (count === 1) {
      for (const friendId of friendIds) {
        emitToUser(friendId, 'presence:update', { userId, online: true })
      }
    }

    socket.emit('presence:snapshot', { online: friendIds.filter(isOnline) })
  } catch (err) {
    console.error('presence connect failed:', err.message)
  }
}
