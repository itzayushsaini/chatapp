import http from 'node:http'

import app from './app.js'
import { connectDb, disconnectDb } from './config/db.js'
import { env } from './config/env.js'
import { deleteUnsentUploads } from './services/attachmentService.js'
import { initSocket } from './socket/index.js'

// Express is mounted on an explicit http.Server rather than app.listen(),
// because Socket.IO has to attach to that same server: HTTP and WebSocket
// traffic then share one port and one origin.
const server = http.createServer(app)
const io = initSocket(server)

async function start() {
  // Connect first: if the database is unreachable, fail loudly at startup
  // instead of accepting requests that are certain to fail.
  await connectDb()

  server.listen(env.PORT, () => {
    console.log(`Server listening on http://localhost:${env.PORT}  [${env.NODE_ENV}]`)
  })

  // Every hour, delete files that were uploaded but never sent. unref() so
  // this timer alone never keeps the process alive during shutdown.
  const cleanUp = () =>
    deleteUnsentUploads().catch((err) => console.error('Upload cleanup failed:', err.message))
  cleanUp()
  setInterval(cleanUp, 60 * 60 * 1000).unref()
}

start().catch((err) => {
  console.error('Failed to start server:', err.message)
  process.exit(1)
})

// Graceful shutdown: stop accepting new connections, let in-flight requests
// finish, then close the database connection so no write is cut off mid-way.
let shuttingDown = false

async function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`\n${signal} received, shutting down...`)

  // Never hang forever on a connection that refuses to close.
  const forceExit = setTimeout(() => {
    console.error('Shutdown timed out, exiting.')
    process.exit(1)
  }, 10_000)
  forceExit.unref()

  // io.close() disconnects every socket and then closes the http server
  // itself (so we must not call server.close() a second time).
  io.close(async () => {
    await disconnectDb()
    clearTimeout(forceExit)
    process.exit(0)
  })
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
