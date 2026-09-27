import { openFile } from '../services/storageService.js'

// Parses a "Range: bytes=..." header for a file of `size` bytes.
// Returns { start, end } (inclusive), null for "no range, send it all", or
// 'invalid' for a range that cannot be satisfied.
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

// Streams a stored file into the HTTP response.
//
// Range support is what lets a <video> seek: the browser asks for just the
// part it needs ("bytes=1000000-") and we answer 206 Partial Content.
//
// `inline: false` sends Content-Disposition: attachment, which makes the
// browser download the file instead of opening it - always used for
// documents, so a file can never be rendered as a page on our domain.
export function sendStoredFile(req, res, next, file) {
  const { fileId, size, mimeType, name, inline, cache } = file
  const range = parseRange(req.headers.range, size)

  if (range === 'invalid') {
    res.set('Content-Range', `bytes */${size}`)
    return res.status(416).end()
  }

  if (inline) res.set('Content-Disposition', 'inline')
  else res.attachment(name) // sets Content-Disposition: attachment; filename="..."

  // Set AFTER res.attachment(), which would otherwise pick a Content-Type
  // from the file's extension. We only trust the type detected from the
  // file's own bytes when it was uploaded.
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
    // Before any bytes are sent we can still answer with a proper error;
    // after that the only honest option is to cut the connection.
    if (!res.headersSent) next(err)
    else res.destroy(err)
  })
  stream.pipe(res)
}
