import http from 'node:http'

import app from './app.js'
import { connectDb, disconnectDb } from './config/db.js'
import { env } from './config/env.js'
import { recoverInterrupted } from './services/aiService.js'
import { deleteUnsentUploads } from './services/attachmentService.js'
import { initSocket } from './socket/index.js'

// Socket.IO attaches to this same server, so HTTP and WebSocket share one port
const server = http.createServer(app)
const io = initSocket(server)

async function start() {
  await connectDb()

  // AI answers cut off by a restart can never finish, so mark them failed
  const interrupted = await recoverInterrupted()
  if (interrupted > 0) console.log(`Marked ${interrupted} interrupted PingMe AI answer(s) as failed`)

  server.listen(env.PORT, () => {
    console.log(`Server listening on http://localhost:${env.PORT}  [${env.NODE_ENV}]`)
  })

  // unref() so this timer never keeps the process alive on shutdown
  const cleanUp = () =>
    deleteUnsentUploads().catch((err) => console.error('Upload cleanup failed:', err.message))
  cleanUp()
  setInterval(cleanUp, 60 * 60 * 1000).unref()
}

start().catch((err) => {
  console.error('Failed to start server:', err.message)
  process.exit(1)
})

let shuttingDown = false

async function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`\n${signal} received, shutting down...`)

  const forceExit = setTimeout(() => {
    console.error('Shutdown timed out, exiting.')
    process.exit(1)
  }, 10_000)
  forceExit.unref()

  // io.close() also closes the http server, so don't call server.close() too
  io.close(async () => {
    await disconnectDb()
    clearTimeout(forceExit)
    process.exit(0)
  })
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
