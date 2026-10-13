// The type comes from the file's bytes, never its name or the browser's Content-Type.
// SVG and HTML are never allowed: they can run scripts on our domain (stored XSS).

const startsWith = (buf, bytes, offset = 0) =>
  bytes.every((byte, i) => buf[offset + i] === byte)

const ascii = (buf, start, end) => buf.subarray(start, end).toString('latin1')

function extensionOf(filename) {
  const dot = filename.lastIndexOf('.')
  return dot === -1 ? '' : filename.slice(dot + 1).toLowerCase()
}

// ZIP and OLE signatures are shared by many formats, so the extension picks the
// label. Safe because documents are only ever served as downloads.
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

// HEIC photos use the same ftyp box, so only these brands are accepted
const MP4_BRANDS = ['isom', 'iso2', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'M4V ', 'dash']

const HEADER_SCAN_BYTES = 64 * 1024

// The track's handler type ("vide" or "soun") sits 8 bytes after "hdlr"
function mp4TrackTypes(buf) {
  const types = new Set()
  const head = buf.subarray(0, 1024 * 1024)
  let at = head.indexOf('hdlr')
  while (at !== -1 && at + 16 <= head.length) {
    types.add(ascii(head, at + 12, at + 16))
    at = head.indexOf('hdlr', at + 4)
  }
  return types
}

function webmIsAudioOnly(buf) {
  const head = ascii(buf, 0, HEADER_SCAN_BYTES)
  return /A_(OPUS|VORBIS)/.test(head) && !/V_(VP8|VP9|AV1|MPEG|THEORA)/.test(head)
}

function isUtf8Text(buf) {
  if (buf.includes(0)) return false
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buf)
    return true
  } catch {
    return false
  }
}

export function detectFileType(buf, filename = '') {
  const ext = extensionOf(filename)

  if (startsWith(buf, [0xff, 0xd8, 0xff])) return { mime: 'image/jpeg', kind: 'image' }
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    return { mime: 'image/png', kind: 'image' }
  if (ascii(buf, 0, 6) === 'GIF87a' || ascii(buf, 0, 6) === 'GIF89a')
    return { mime: 'image/gif', kind: 'image' }
  if (ascii(buf, 0, 4) === 'RIFF' && ascii(buf, 8, 12) === 'WEBP')
    return { mime: 'image/webp', kind: 'image' }

  if (ascii(buf, 4, 8) === 'ftyp') {
    const brand = ascii(buf, 8, 12)
    if (brand === 'qt  ') return { mime: 'video/quicktime', kind: 'video' }
    if (brand === 'M4A ') return { mime: 'audio/mp4', kind: 'audio' }
    if (MP4_BRANDS.includes(brand)) {
      const tracks = mp4TrackTypes(buf)
      if (tracks.has('soun') && !tracks.has('vide')) return { mime: 'audio/mp4', kind: 'audio' }
      return { mime: 'video/mp4', kind: 'video' }
    }
    return null
  }
  if (startsWith(buf, [0x1a, 0x45, 0xdf, 0xa3])) {
    return webmIsAudioOnly(buf) ? { mime: 'audio/webm', kind: 'audio' } : { mime: 'video/webm', kind: 'video' }
  }
  if (ascii(buf, 0, 4) === 'OggS') {
    const head = ascii(buf, 0, HEADER_SCAN_BYTES)
    if (head.includes('theora')) return null
    if (head.includes('OpusHead') || head.includes('vorbis')) return { mime: 'audio/ogg', kind: 'audio' }
    return null
  }

  if (ascii(buf, 0, 5) === '%PDF-') return { mime: 'application/pdf', kind: 'file' }
  if (startsWith(buf, [0x50, 0x4b, 0x03, 0x04]))
    return ZIP_TYPES[ext] ? { mime: ZIP_TYPES[ext], kind: 'file' } : null
  if (startsWith(buf, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))
    return OLE_TYPES[ext] ? { mime: OLE_TYPES[ext], kind: 'file' } : null
  if (ext === 'txt' && buf.length > 0 && isUtf8Text(buf))
    return { mime: 'text/plain', kind: 'file' }

  return null
}
