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
import aiRoutes from './routes/ai.routes.js'
import attachmentsRoutes from './routes/attachments.routes.js'
import authRoutes from './routes/auth.routes.js'
import conversationsRoutes from './routes/conversations.routes.js'
import friendsRoutes from './routes/friends.routes.js'
import pushRoutes from './routes/push.routes.js'
import settingsRoutes from './routes/settings.routes.js'
import updatesRoutes from './routes/updates.routes.js'
import usersRoutes from './routes/users.routes.js'

const thisDir = path.dirname(fileURLToPath(import.meta.url))

const app = express()

// Behind the host's proxy: needed for the real req.ip (rate limits) and secure cookies
if (isProduction) {
  app.set('trust proxy', 1)
}

// blob: lets the chat preview a picked file before it is uploaded
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
// Messages are at most 2000 characters, so 10kb is plenty
app.use(express.json({ limit: '10kb' }))
app.use(cookieParser())

if (!isTest) {
  app.use(morgan(isProduction ? 'combined' : 'dev'))
}

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
app.use('/api/ai', aiRoutes)
app.use('/api/push', pushRoutes)
app.use('/api/admin', adminRoutes)

// One origin for API and client, so cookies stay first-party
if (isProduction) {
  const clientDist = path.resolve(thisDir, '../../client/dist')

  app.use(express.static(clientDist))

  // Other GETs are client-side routes like /login, so send index.html
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next()
    res.sendFile(path.join(clientDist, 'index.html'))
  })
}

app.use(notFound)
app.use(errorHandler)

// No listen() here: server.js wraps it in an http.Server shared with Socket.IO
export default app
