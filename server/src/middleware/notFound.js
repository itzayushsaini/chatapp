import { AppError } from '../utils/AppError.js'

// Runs when no route matched. It deliberately does not echo the requested URL
// back to the caller - there is no reason to reflect user input in a response.
export function notFound(req, res, next) {
  next(new AppError(404, 'Not found'))
}
