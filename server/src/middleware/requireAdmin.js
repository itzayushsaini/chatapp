import { AppError } from '../utils/AppError.js'

// Runs after requireAuth. 403, not 404: admin routes existing is no secret
export function requireAdmin(req, res, next) {
  if (!req.user.isAdmin) throw new AppError(403, 'Admins only')
  next()
}
