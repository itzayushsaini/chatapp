// Stays null when Socket.IO isn't started, so every emit quietly does nothing
let io = null

export function setIo(instance) {
  io = instance
}

export function emitToUser(userId, event, payload) {
  if (!io) return
  io.to(`user:${userId}`).emit(event, payload)
}

export function emitToAll(event, payload) {
  if (!io) return
  io.emit(event, payload)
}

export function disconnectUser(userId) {
  if (!io) return
  io.in(`user:${userId}`).disconnectSockets()
}
