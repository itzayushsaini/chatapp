import path from 'node:path'
import { fileURLToPath } from 'node:url'

import cookieParser from 'cookie-parser'
import express from 'express'
import helmet from 'helmet'
import morgan from 'morgan'

import { isProduction, isTest } from './config/env.js'
import { errorHandler } from './middleware/errorHandler.js'
import { notFound } from './middleware/notFound.js'
import adminRoutes from './routes/admin.routes.js'
import attachmentsRoutes from './routes/attachments.routes.js'
import authRoutes from './routes/auth.routes.js'
import conversationsRoutes from './routes/conversations.routes.js'
import friendsRoutes from './routes/friends.routes.js'
import settingsRoutes from './routes/settings.routes.js'
import updatesRoutes from './routes/updates.routes.js'
import usersRoutes from './routes/users.routes.js'

const thisDir = path.dirname(fileURLToPath(import.meta.url))

const app = express()

// Behind a hosting platform's proxy, req.ip and "is this HTTPS?" are only
// correct once Express is told to trust the X-Forwarded-* headers. Rate limits
// and secure cookies depend on this.
if (isProduction) {
  app.set('trust proxy', 1)
}

// helmet's default Content-Security-Policy, plus one addition: "blob:" URLs
// for pictures and videos. That is how the chat previews a file you picked
// BEFORE it is uploaded - the browser makes a temporary blob: URL for it.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        'img-src': ["'self'", 'data:', 'blob:'],
        'media-src': ["'self'", 'blob:'],
      },
    },
  }),
)
// A chat message is at most 2000 characters, so a small body limit is plenty
// and stops someone posting a huge payload to tie up the server.
app.use(express.json({ limit: '10kb' }))
app.use(cookieParser())

// Request logging - noisy and pointless during tests.
if (!isTest) {
  app.use(morgan(isProduction ? 'combined' : 'dev'))
}

// Unauthenticated, so a host or uptime monitor can check the service is alive.
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' })
})

app.use('/api/auth', authRoutes)
app.use('/api/users', usersRoutes)
app.use('/api/friends', friendsRoutes)
app.use('/api/conversations', conversationsRoutes)
app.use('/api/attachments', attachmentsRoutes)
app.use('/api/settings', settingsRoutes)
app.use('/api/updates', updatesRoutes)
app.use('/api/admin', adminRoutes)

// In production one Node process serves both the API and the built React app,
// which keeps the frontend and backend on one origin so cookies stay
// first-party. In development Vite serves the client and proxies /api here.
if (isProduction) {
  const clientDist = path.resolve(thisDir, '../../client/dist')

  app.use(express.static(clientDist))

  // Any GET that is not an API call and did not match a real file is a
  // client-side route such as /login, so hand back index.html and let React
  // Router take over. This makes a hard refresh on /login work.
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next()
    res.sendFile(path.join(clientDist, 'index.html'))
  })
}

app.use(notFound)
app.use(errorHandler)

// Exported WITHOUT calling listen, so tests can drive it with Supertest and
// server.js can wrap it in an http.Server that Socket.IO also attaches to.
export default app
