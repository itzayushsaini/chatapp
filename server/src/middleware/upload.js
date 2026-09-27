import multer from 'multer'

import { AppError } from '../utils/AppError.js'

// Parses ONE file from a multipart/form-data request (the format browsers use
// to upload files) into req.file = { buffer, originalname, size, ... }.
//
// memoryStorage keeps the file in RAM just long enough to check it and pass
// it to GridFS - nothing is ever written to the server's disk, which on a
// host like Render is wiped on every deploy anyway.
//
// `maxBytes` is enforced WHILE the upload streams in, so an oversized file is
// cut off early instead of being read completely first.
export function singleFile(field, maxBytes) {
  const parse = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: 1, fields: 5 },
    // Browsers send the file name as raw UTF-8. multer's default (latin1)
    // would turn a name like "रिपोर्ट.pdf" into gibberish.
    defParamCharset: 'utf8',
  }).single(field)

  return (req, res, next) => {
    parse(req, res, (err) => {
      if (!err) {
        if (!req.file) return next(new AppError(400, 'No file uploaded'))
        return next()
      }
      // Turn multer's errors into our { message } shape.
      if (err.code === 'LIMIT_FILE_SIZE') return next(new AppError(413, 'File is too large'))
      if (err instanceof multer.MulterError) return next(new AppError(400, 'Invalid upload'))
      next(err)
    })
  }
}
