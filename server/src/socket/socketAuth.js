import cookie from 'cookie'

import { SESSION_COOKIE, userFromToken } from '../services/authService.js'

// The handshake carries the same httpOnly cookie as REST calls, so no second token
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
