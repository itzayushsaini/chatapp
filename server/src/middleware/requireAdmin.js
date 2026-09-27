import { AppError } from '../utils/AppError.js'

// Runs AFTER requireAuth, so req.user is already set. 403, not 404: unlike a
// conversation (where hiding existence matters), there is nothing sensitive
// about a logged-in user simply learning that admin routes exist.
export function requireAdmin(req, res, next) {
  if (!req.user.isAdmin) throw new AppError(403, 'Admins only')
  next()
}
