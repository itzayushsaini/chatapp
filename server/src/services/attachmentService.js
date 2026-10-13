import { Attachment } from '../models/Attachment.js'
import { AppError } from '../utils/AppError.js'
import { cleanFileName } from '../utils/fileName.js'
import { detectFileType } from '../utils/fileType.js'
import { assertFriends, assertParticipant } from './friendService.js'
import { getSettings } from './settingsService.js'
import { deleteFile, saveFile } from './storageService.js'

const MB = 1024 * 1024

// multer allows the largest size; the per-kind limit is checked once the real type is known
export const MAX_BYTES = { image: 10 * MB, file: 10 * MB, audio: 10 * MB, video: 25 * MB }
export const UPLOAD_MAX_BYTES = Math.max(...Object.values(MAX_BYTES))

const UNSENT_TTL_MS = 60 * 60 * 1000

export function attachmentView(attachment) {
  const id = String(attachment._id)
  const view = {
    id,
    name: attachment.name,
    mimeType: attachment.mimeType,
    size: attachment.size,
    kind: attachment.kind,
    url: `/api/attachments/${id}`,
  }
  if (attachment.kind === 'audio') {
    view.durationMs = attachment.durationMs ?? null
    view.waveform = attachment.waveform?.length ? [...attachment.waveform] : null
  }
  return view
}

// Called before the file is read, so a stranger can't make the server receive an upload
export async function assertCanUpload(meId, conversationId) {
  const settings = await getSettings()
  if (!settings.attachmentsEnabled) throw new AppError(403, 'Attachments are currently disabled')

  const conversation = await assertParticipant(conversationId, meId)
  const otherId = conversation.participants.find((p) => String(p) !== String(meId))
  await assertFriends(meId, otherId)
}

export async function createAttachment(meId, conversationId, file, voice = {}) {
  await assertCanUpload(meId, conversationId)

  const type = detectFileType(file.buffer, file.originalname)
  if (!type) throw new AppError(400, 'This file type is not supported')
  if (file.size > MAX_BYTES[type.kind]) throw new AppError(413, 'File is too large')

  const name = cleanFileName(file.originalname)

  const fileId = await saveFile(file.buffer, {
    filename: name,
    contentType: type.mime,
    metadata: { purpose: 'attachment', uploader: meId, conversation: conversationId },
  })

  const attachment = await Attachment.create({
    uploader: meId,
    conversation: conversationId,
    fileId,
    name,
    mimeType: type.mime,
    size: file.size,
    kind: type.kind,
    ...(type.kind === 'audio' && {
      durationMs: voice.durationMs ?? null,
      waveform: voice.waveform ?? undefined,
    }),
  })
  return attachment
}

// Anyone not allowed gets the same 404 as for a file that doesn't exist
export async function getForDownload(meId, attachmentId) {
  const notFound = new AppError(404, 'File not found')

  const attachment = await Attachment.findById(attachmentId)
  if (!attachment) throw notFound

  try {
    await assertParticipant(attachment.conversation, meId)
  } catch (err) {
    if (err instanceof AppError) throw notFound
    throw err
  }

  const unsent = !attachment.message
  if (unsent && String(attachment.uploader) !== String(meId)) throw notFound

  return attachment
}

export async function deleteUnsentUploads(olderThanMs = UNSENT_TTL_MS) {
  const cutoff = new Date(Date.now() - olderThanMs)
  const stale = await Attachment.find({ message: null, createdAt: { $lt: cutoff } }, { _id: 1 })

  let deleted = 0
  for (const { _id } of stale) {
    // only if still unsent: a message may have claimed it since the find
    const removed = await Attachment.findOneAndDelete({ _id, message: null })
    if (!removed) continue
    await deleteFile(removed.fileId)
    deleted++
  }
  return deleted
}
