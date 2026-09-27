import cookie from 'cookie'

import { SESSION_COOKIE, userFromToken } from '../services/authService.js'

// Runs once per connection, BEFORE the connection is accepted (io.use).
//
// The browser sends the same httpOnly cookie on the Socket.IO handshake that
// it sends on REST calls (same origin), so sockets are authenticated with the
// exact same session - no second token, nothing in localStorage.
export async function socketAuth(socket, next) {
  try {
    const cookies = cookie.parse(socket.handshake.headers.cookie ?? '')
    const user = await userFromToken(cookies[SESSION_COOKIE])
    if (!user) return next(new Error('Unauthorized'))

    socket.data.userId = String(user._id)
    next()
  } catch {
    next(new Error('Unauthorized'))
  }
}
