import { SESSION_COOKIE, userFromToken } from '../services/authService.js'
import { AppError } from '../utils/AppError.js'

// Every route except health, register, login and logout runs this first.
// After it, req.user is the logged-in User document.
export async function requireAuth(req, res, next) {
  const user = await userFromToken(req.cookies[SESSION_COOKIE])
  if (!user) throw new AppError(401, 'Not authenticated')

  req.user = user
  next()
}
