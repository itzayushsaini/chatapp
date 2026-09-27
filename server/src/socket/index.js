import { Server } from 'socket.io'

import { setIo } from './emitter.js'
import { registerMessageHandlers } from './handlers/messageHandlers.js'
import { registerPresenceHandlers } from './handlers/presenceHandlers.js'
import { registerReadHandlers } from './handlers/readHandlers.js'
import { socketAuth } from './socketAuth.js'

// Attaches Socket.IO to the SAME http.Server as Express, on the default path
// /socket.io. The browser loads the page and opens the socket from one
// origin, so no CORS settings are needed.
export function initSocket(httpServer) {
  const io = new Server(httpServer)

  io.use(socketAuth)

  io.on('connection', (socket) => {
    // One room per user. All of a user's tabs are in it, so we always emit to
    // the room and never have to track individual socket ids.
    socket.join(`user:${socket.data.userId}`)

    registerMessageHandlers(socket)
    registerPresenceHandlers(socket)
    registerReadHandlers(socket)
  })

  // From now on, services' emitToUser calls actually reach clients.
  setIo(io)
  return io
}
