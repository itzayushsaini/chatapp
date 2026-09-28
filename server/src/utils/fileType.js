// Works out what a file REALLY is from its first bytes ("magic numbers"),
// never from its name or the Content-Type the browser sent - both are chosen
// by whoever uploads it. Anything not on this list is refused.
//
// Returns { mime, kind } or null. kind is 'image' | 'video' | 'audio' | 'file'.
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
// photos use the same box, so only these brands are accepted. "M4A " is an
// audio-only MP4 (what Safari's voice recorder produces).
const MP4_BRANDS = ['isom', 'iso2', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'M4V ', 'dash']

// How far into a file to look for its track information. Recorders write it
// right at the start, long before any actual sound or picture data.
const HEADER_SCAN_BYTES = 64 * 1024

// An MP4 lists each of its tracks with a "hdlr" box whose handler type says
// what the track is: "vide" (picture) or "soun" (sound). The type sits 8
// bytes after the word "hdlr" (after 4 bytes of version/flags and 4 unused).
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

// WebM (the same container for video and for a voice note) names each
// track's codec as plain text: "A_OPUS" for sound, "V_VP8" for picture...
// A file with sound codecs but no picture codec is audio.
function webmIsAudioOnly(buf) {
  const head = ascii(buf, 0, HEADER_SCAN_BYTES)
  return /A_(OPUS|VORBIS)/.test(head) && !/V_(VP8|VP9|AV1|MPEG|THEORA)/.test(head)
}

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

  // --- Videos, and voice notes (the same containers) ---
  if (ascii(buf, 4, 8) === 'ftyp') {
    const brand = ascii(buf, 8, 12)
    if (brand === 'qt  ') return { mime: 'video/quicktime', kind: 'video' }
    if (brand === 'M4A ') return { mime: 'audio/mp4', kind: 'audio' }
    if (MP4_BRANDS.includes(brand)) {
      // A sound track and no picture track = audio. Anything else, including
      // a file whose tracks cannot be found, stays a video as before.
      const tracks = mp4TrackTypes(buf)
      if (tracks.has('soun') && !tracks.has('vide')) return { mime: 'audio/mp4', kind: 'audio' }
      return { mime: 'video/mp4', kind: 'video' }
    }
    return null
  }
  if (startsWith(buf, [0x1a, 0x45, 0xdf, 0xa3])) {
    return webmIsAudioOnly(buf) ? { mime: 'audio/webm', kind: 'audio' } : { mime: 'video/webm', kind: 'video' }
  }
  // Ogg (Firefox's voice recorder) - only with Opus or Vorbis sound inside;
  // an Ogg video (Theora) is not on the allowed list.
  if (ascii(buf, 0, 4) === 'OggS') {
    const head = ascii(buf, 0, HEADER_SCAN_BYTES)
    if (head.includes('theora')) return null
    if (head.includes('OpusHead') || head.includes('vorbis')) return { mime: 'audio/ogg', kind: 'audio' }
    return null
  }

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
