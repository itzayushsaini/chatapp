import { z } from 'zod'

import { AppError } from '../utils/AppError.js'

export const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id')

// Controllers read only req.valid. This also blocks NoSQL injection like
// { "username": { "$gt": "" } }, since z.string() rejects an object.
export function validate(schemas) {
  return (req, res, next) => {
    // Uploads run this twice: params before multer, body after it
    req.valid ??= {}
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
