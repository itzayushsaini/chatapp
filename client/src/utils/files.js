// Only quick feedback before uploading - the server checks the real bytes.

const MB = 1024 * 1024

export const MAX_BYTES = { image: 10 * MB, file: 10 * MB, video: 25 * MB }

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp']
const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov']
const FILE_EXTENSIONS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'zip']

export const ACCEPT = [...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS, ...FILE_EXTENSIONS]
  .map((ext) => `.${ext}`)
  .join(',')

function extensionOf(name) {
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase()
}

export function kindOf(file) {
  const ext = extensionOf(file.name)
  if (IMAGE_EXTENSIONS.includes(ext)) return 'image'
  if (VIDEO_EXTENSIONS.includes(ext)) return 'video'
  return 'file'
}

export function checkFile(file) {
  const ext = extensionOf(file.name)
  if (![...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS, ...FILE_EXTENSIONS].includes(ext)) {
    return 'This file type is not supported'
  }
  const kind = kindOf(file)
  if (file.size > MAX_BYTES[kind]) {
    const label = kind === 'video' ? 'Videos' : kind === 'image' ? 'Photos' : 'Documents'
    return `${label} can be at most ${MAX_BYTES[kind] / MB} MB`
  }
  if (file.size === 0) return 'This file is empty'
  return null
}

// Gemini can't read GIFs or Office documents
const AI_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'pdf', 'txt', 'mp4', 'webm', 'mov']
const AI_MAX_BYTES = 10 * MB

export const AI_ACCEPT = AI_EXTENSIONS.map((ext) => `.${ext}`).join(',')
export const AI_IMAGE_ACCEPT = '.jpg,.jpeg,.png,.webp'

export function checkAiFile(file) {
  if (!AI_EXTENSIONS.includes(extensionOf(file.name))) {
    return 'PingMe AI can read photos (JPEG, PNG, WebP), PDFs, text files and videos'
  }
  if (file.size > AI_MAX_BYTES) return 'Files for PingMe AI can be at most 10 MB'
  if (file.size === 0) return 'This file is empty'
  return null
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < MB) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / MB).toFixed(1)} MB`
}

export function attachmentLabel(attachment, caption) {
  if (attachment.kind === 'audio') return '🎤 Voice message'
  if (attachment.kind === 'image') return `📷 ${caption || 'Photo'}`
  if (attachment.kind === 'video') return `🎥 ${caption || 'Video'}`
  return `📄 ${attachment.name}`
}
