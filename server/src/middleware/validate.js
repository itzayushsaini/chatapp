import { z } from 'zod'

import { AppError } from '../utils/AppError.js'

// A MongoDB ObjectId in its 24-character hex form. Used for every :id param.
export const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id')

// Usage: router.post('/x', validate({ body: schema }), controller)
//
// The parsed, cleaned values are put on req.valid. Controllers read ONLY from
// req.valid, never from req.body / req.query directly, so unvalidated input
// cannot reach a service.
//
// This is also what blocks NoSQL injection: a body like
// { "username": { "$gt": "" } } fails because z.string() rejects an object.
export function validate(schemas) {
  return (req, res, next) => {
    req.valid = {}
    for (const part of ['params', 'query', 'body']) {
      if (!schemas[part]) continue

      const result = schemas[part].safeParse(req[part] ?? {})
      if (!result.success) {
        const issue = result.error.issues[0]
        const field = issue.path.join('.')
        return next(new AppError(400, field ? `${field}: ${issue.message}` : issue.message))
      }
      req.valid[part] = result.data
    }
    next()
  }
}
