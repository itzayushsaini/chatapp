import { SESSION_COOKIE, userFromToken } from '../services/authService.js'
import { AppError } from '../utils/AppError.js'

export async function requireAuth(req, res, next) {
  const user = await userFromToken(req.cookies[SESSION_COOKIE])
  if (!user) throw new AppError(401, 'Not authenticated')

  req.user = user
  next()
}
