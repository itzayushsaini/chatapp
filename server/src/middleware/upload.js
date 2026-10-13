import multer from 'multer'
import { z } from 'zod'

import { AppError } from '../utils/AppError.js'

// Multipart fields always arrive as strings; both are display-only
export const voiceNoteFields = {
  durationMs: z.coerce.number().int().min(0).max(5 * 60 * 1000).optional(),
  waveform: z
    .string()
    .max(1000)
    .transform((text, ctx) => {
      try {
        return JSON.parse(text)
      } catch {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'must be a JSON array' })
        return z.NEVER
      }
    })
    .pipe(z.array(z.number().int().min(0).max(100)).max(64))
    .optional(),
}

// Kept in memory, never on disk; maxBytes cuts an oversized file off while it streams in
export function singleFile(field, maxBytes, { optional = false } = {}) {
  const parse = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: 1, fields: 5 },
    // Browsers send UTF-8 file names; multer's latin1 default garbles them
    defParamCharset: 'utf8',
  }).single(field)

  return (req, res, next) => {
    parse(req, res, (err) => {
      if (!err) {
        if (!req.file && !optional) return next(new AppError(400, 'No file uploaded'))
        return next()
      }
      if (err.code === 'LIMIT_FILE_SIZE') return next(new AppError(413, 'File is too large'))
      if (err instanceof multer.MulterError) return next(new AppError(400, 'Invalid upload'))
      next(err)
    })
  }
}
