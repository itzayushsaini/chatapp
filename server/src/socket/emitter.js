// The one way services send real-time notifications.
//
// It holds a reference to the Socket.IO server, set by socket/index.js at
// startup. REST tests never start Socket.IO, so `io` stays null and every
// emit quietly does nothing - the services work the same with or without it.
let io = null

export function setIo(instance) {
  io = instance
}

// Every user's sockets (all their open tabs) join the room 'user:<id>', so
// emitting to the room reaches all of them. We never store socket ids.
export function emitToUser(userId, event, payload) {
  if (!io) return
  io.to(`user:${userId}`).emit(event, payload)
}
