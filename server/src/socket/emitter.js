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

// Every connected client, logged in or not relevant to the event - used for
// the admin's announcement banner, which anyone with the app open should see.
export function emitToAll(event, payload) {
  if (!io) return
  io.emit(event, payload)
}

// Ends a user's session immediately, on every open tab - used when an admin
// suspends an account, so it can't keep chatting until its token happens to
// expire on its own.
export function disconnectUser(userId) {
  if (!io) return
  io.in(`user:${userId}`).disconnectSockets()
}
