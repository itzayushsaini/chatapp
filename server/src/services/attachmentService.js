import { Attachment } from '../models/Attachment.js'
import { AppError } from '../utils/AppError.js'
import { detectFileType } from '../utils/fileType.js'
import { assertFriends, assertParticipant } from './friendService.js'
import { getSettings } from './settingsService.js'
import { deleteFile, saveFile } from './storageService.js'

const MB = 1024 * 1024

// Size limits per kind. The upload middleware is set to the largest one; the
// real limit is checked here, once we know what the file actually is.
export const MAX_BYTES = { image: 10 * MB, file: 10 * MB, video: 25 * MB }
export const UPLOAD_MAX_BYTES = Math.max(...Object.values(MAX_BYTES))

// An upload that no message has used after this long is deleted.
const UNSENT_TTL_MS = 60 * 60 * 1000

// The one shape an attachment has when it leaves the server. The url points
// at our own download route, which checks permissions on every request.
export function attachmentView(attachment) {
  const id = String(attachment._id)
  return {
    id,
    name: attachment.name,
    mimeType: attachment.mimeType,
    size: attachment.size,
    kind: attachment.kind,
    url: `/api/attachments/${id}`,
  }
}

// The same rules as sending a message: I must be in the conversation and
// still friends with the other person. Called BEFORE the file is read, so a
// stranger cannot make the server receive a 25 MB upload at all.
export async function assertCanUpload(meId, conversationId) {
  const settings = await getSettings()
  if (!settings.attachmentsEnabled) throw new AppError(403, 'Attachments are currently disabled')

  const conversation = await assertParticipant(conversationId, meId)
  const otherId = conversation.participants.find((p) => String(p) !== String(meId))
  await assertFriends(meId, otherId)
}

// `file` is multer's { buffer, originalname, size }.
export async function createAttachment(meId, conversationId, file) {
  await assertCanUpload(meId, conversationId)

  const type = detectFileType(file.buffer, file.originalname)
  if (!type) throw new AppError(400, 'This file type is not supported')
  if (file.size > MAX_BYTES[type.kind]) throw new AppError(413, 'File is too large')

  // Only the base name, and only printable characters: the name is shown to
  // the other person and sent back in a download header.
  const name =
    file.originalname
      .split(/[\\/]/)
      .pop()
      // eslint-disable-next-line no-control-regex -- stripping control characters is the point
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .slice(0, 200) || 'file'

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
  })
  return attachment
}

// Who may download: the two people in the conversation - and, until it has
// been sent, only the person who uploaded it. Everyone else gets 404, the
// same answer as for a file that does not exist.
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

// Deletes uploads that were never attached to a message (the user picked a
// file, then closed the tab). Runs every hour from server.js.
export async function deleteUnsentUploads(olderThanMs = UNSENT_TTL_MS) {
  const cutoff = new Date(Date.now() - olderThanMs)
  const stale = await Attachment.find({ message: null, createdAt: { $lt: cutoff } }, { _id: 1 })

  let deleted = 0
  for (const { _id } of stale) {
    // Remove the document first, and only if it is STILL unsent - a message
    // may have claimed it since the find above. Then remove the bytes.
    const removed = await Attachment.findOneAndDelete({ _id, message: null })
    if (!removed) continue
    await deleteFile(removed.fileId)
    deleted++
  }
  return deleted
}
