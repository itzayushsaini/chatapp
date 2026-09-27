import { isProduction } from '../config/env.js'

// Express treats a function with FOUR arguments as an error handler, so `_next`
// must stay in the signature even though it is unused.
//
// Express 5 also forwards rejected promises from async handlers here
// automatically, which is why routes do not need their own try/catch.
export function errorHandler(err, req, res, _next) {
  // AppError sets `status`. express.json() also sets one for malformed or
  // oversized bodies. Anything else is an unexpected bug.
  const status = Number.isInteger(err.status) ? err.status : 500

  // An unexpected error may contain internal details, so in production the
  // client gets a generic message while the full error stays in the log.
  const message = status === 500 && isProduction ? 'Something went wrong' : err.message

  if (status === 500) {
    console.error(err)
  }

  res.status(status).json({ message })
}
