// Works out what a file REALLY is from its first bytes ("magic numbers"),
// never from its name or the Content-Type the browser sent - both are chosen
// by whoever uploads it. Anything not on this list is refused.
//
// Returns { mime, kind } or null. kind is 'image' | 'video' | 'file'.
//
// Deliberately NOT allowed: SVG and HTML. Both can contain JavaScript, and a
// browser that displayed one from our domain would run it (stored XSS).

const startsWith = (buf, bytes, offset = 0) =>
  bytes.every((byte, i) => buf[offset + i] === byte)

const ascii = (buf, start, end) => buf.subarray(start, end).toString('latin1')

function extensionOf(filename) {
  const dot = filename.lastIndexOf('.')
  return dot === -1 ? '' : filename.slice(dot + 1).toLowerCase()
}

// ZIP (Office 2007+ files are ZIP archives) and OLE (Office 97-2003) share a
// signature with many formats, so for those the extension picks the label.
// That is safe because documents are only ever served as downloads.
const ZIP_TYPES = {
  zip: 'application/zip',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}
const OLE_TYPES = {
  doc: 'application/msword',
  xls: 'application/vnd.ms-excel',
  ppt: 'application/vnd.ms-powerpoint',
}

// MP4-family files have "ftyp" at byte 4, then a 4-letter "brand". HEIC
// photos and M4A audio use the same box, so only video brands are accepted.
const MP4_BRANDS = ['isom', 'iso2', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'M4V ', 'dash']

function isUtf8Text(buf) {
  if (buf.includes(0)) return false // a NUL byte means binary
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buf)
    return true
  } catch {
    return false
  }
}

export function detectFileType(buf, filename = '') {
  const ext = extensionOf(filename)

  // --- Images ---
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return { mime: 'image/jpeg', kind: 'image' }
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    return { mime: 'image/png', kind: 'image' }
  if (ascii(buf, 0, 6) === 'GIF87a' || ascii(buf, 0, 6) === 'GIF89a')
    return { mime: 'image/gif', kind: 'image' }
  if (ascii(buf, 0, 4) === 'RIFF' && ascii(buf, 8, 12) === 'WEBP')
    return { mime: 'image/webp', kind: 'image' }

  // --- Videos ---
  if (ascii(buf, 4, 8) === 'ftyp') {
    const brand = ascii(buf, 8, 12)
    if (brand === 'qt  ') return { mime: 'video/quicktime', kind: 'video' }
    if (MP4_BRANDS.includes(brand)) return { mime: 'video/mp4', kind: 'video' }
    return null
  }
  if (startsWith(buf, [0x1a, 0x45, 0xdf, 0xa3])) return { mime: 'video/webm', kind: 'video' }

  // --- Documents ---
  if (ascii(buf, 0, 5) === '%PDF-') return { mime: 'application/pdf', kind: 'file' }
  if (startsWith(buf, [0x50, 0x4b, 0x03, 0x04]))
    return ZIP_TYPES[ext] ? { mime: ZIP_TYPES[ext], kind: 'file' } : null
  if (startsWith(buf, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))
    return OLE_TYPES[ext] ? { mime: OLE_TYPES[ext], kind: 'file' } : null
  // Plain text has no signature, so it needs both the .txt name and content
  // that really is text.
  if (ext === 'txt' && buf.length > 0 && isUtf8Text(buf))
    return { mime: 'text/plain', kind: 'file' }

  return null
}
