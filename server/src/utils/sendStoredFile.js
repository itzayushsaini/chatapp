import { openFile } from '../services/storageService.js'

// Returns { start, end } (inclusive), null for no range, or 'invalid'
export function parseRange(header, size) {
  if (!header) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match || (match[1] === '' && match[2] === '')) return 'invalid'

  let start
  let end
  if (match[1] === '') {
    // "bytes=-500" means "the last 500 bytes"
    start = Math.max(size - Number(match[2]), 0)
    end = size - 1
  } else {
    start = Number(match[1])
    end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1)
  }
  if (start > end || start >= size) return 'invalid'
  return { start, end }
}

// Range support is what lets a <video> seek (206 Partial Content)
export function sendStoredFile(req, res, next, file) {
  const { fileId, size, mimeType, name, inline, cache } = file
  const range = parseRange(req.headers.range, size)

  if (range === 'invalid') {
    res.set('Content-Range', `bytes */${size}`)
    return res.status(416).end()
  }

  if (inline) res.set('Content-Disposition', 'inline')
  else res.attachment(name)

  // After res.attachment(), which would guess a type from the extension; only the detected type is trusted
  res.set({
    'Content-Type': mimeType,
    'Accept-Ranges': 'bytes',
    'Cache-Control': cache,
  })

  if (range) {
    res.status(206)
    res.set('Content-Range', `bytes ${range.start}-${range.end}/${size}`)
    res.set('Content-Length', String(range.end - range.start + 1))
  } else {
    res.set('Content-Length', String(size))
  }

  const stream = openFile(fileId, range)
  stream.on('error', (err) => {
    // Once bytes are sent, the only option left is to cut the connection
    if (!res.headersSent) next(err)
    else res.destroy(err)
  })
  stream.pipe(res)
}
