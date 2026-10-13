import { Server } from 'socket.io'

import { setIo } from './emitter.js'
import { registerDeliveryHandlers } from './handlers/deliveryHandlers.js'
import { registerMessageHandlers } from './handlers/messageHandlers.js'
import { registerPresenceHandlers } from './handlers/presenceHandlers.js'
import { registerReadHandlers } from './handlers/readHandlers.js'
import { registerTypingHandlers } from './handlers/typingHandlers.js'
import { socketAuth } from './socketAuth.js'

// Same server and origin as Express, so no CORS settings are needed
export function initSocket(httpServer) {
  const io = new Server(httpServer)

  io.use(socketAuth)

  io.on('connection', (socket) => {
    socket.join(`user:${socket.data.userId}`)

    registerMessageHandlers(socket)
    registerPresenceHandlers(socket)
    registerReadHandlers(socket)
    registerTypingHandlers(socket)
    registerDeliveryHandlers(socket)
  })

  setIo(io)
  return io
}
