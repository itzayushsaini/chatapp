import { isProduction } from '../config/env.js'

// Express needs all four arguments to see an error handler, so keep `_next`.
// Express 5 sends rejected promises from async handlers here too.
export function errorHandler(err, req, res, _next) {
  const status = Number.isInteger(err.status) ? err.status : 500

  // Don't leak internal details in production; the full error is logged
  const message = status === 500 && isProduction ? 'Something went wrong' : err.message

  if (status === 500) {
    console.error(err)
  }

  res.status(status).json({ message })
}
