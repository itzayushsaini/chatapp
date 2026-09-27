import * as authService from '../services/authService.js'
import { selfUser } from '../utils/publicUser.js'

// Controllers stay thin: read validated input, call a service, send a
// response. The token goes ONLY into the httpOnly cookie, never the body.
function startSession(res, user) {
  res.cookie(authService.SESSION_COOKIE, authService.signToken(user._id), authService.cookieOptions)
}

export async function register(req, res) {
  const user = await authService.register(req.valid.body)
  startSession(res, user)
  res.status(201).json({ user: selfUser(user) })
}

export async function login(req, res) {
  const user = await authService.login(req.valid.body)
  startSession(res, user)
  res.json({ user: selfUser(user) })
}

export function logout(req, res) {
  // clearCookie needs the same path/sameSite/secure to match the cookie, but
  // not maxAge (Express warns about it being passed here).
  const { maxAge: _maxAge, ...clearOptions } = authService.cookieOptions
  res.clearCookie(authService.SESSION_COOKIE, clearOptions)
  res.status(204).end()
}

export function me(req, res) {
  res.json({ user: selfUser(req.user) })
}
