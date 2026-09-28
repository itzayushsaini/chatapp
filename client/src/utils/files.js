// What the chat accepts, for quick feedback BEFORE uploading. The server
// checks every file again by its actual bytes - this is only a convenience,
// never the security check.

const MB = 1024 * 1024

export const MAX_BYTES = { image: 10 * MB, file: 10 * MB, video: 25 * MB }

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp']
const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov']
const FILE_EXTENSIONS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'zip']

// For the file picker's accept="" - which files it offers to choose.
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

// Returns an error message, or null if the file looks fine.
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

// 1536 -> "1.5 KB", 5242880 -> "5.0 MB"
export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < MB) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / MB).toFixed(1)} MB`
}

// Short text for a sidebar preview, e.g. "📷 Photo" or "📄 notes.pdf".
export function attachmentLabel(attachment, caption) {
  if (attachment.kind === 'audio') return '🎤 Voice message'
  if (attachment.kind === 'image') return `📷 ${caption || 'Photo'}`
  if (attachment.kind === 'video') return `🎥 ${caption || 'Video'}`
  return `📄 ${attachment.name}`
}
