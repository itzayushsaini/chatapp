import { Update } from '../models/Update.js'
import { User } from '../models/User.js'
import { emitToAll, emitToUser } from '../socket/emitter.js'
import { AppError } from '../utils/AppError.js'
import { detectFileType } from '../utils/fileType.js'
import { notifyUpdatePosted } from './pushService.js'
import { deleteFile, getFileInfo, saveFile } from './storageService.js'

// The "PingMe" updates channel: admins post, every logged-in user reads.

export const UPDATE_IMAGE_MAX_BYTES = 10 * 1024 * 1024
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

// The shape sent to clients. The author is never included - to users every
// post simply comes from "PingMe".
export function updateView(update) {
  return {
    id: String(update._id),
    text: update.text,
    imageUrl: update.imageFileId ? `/api/updates/${update._id}/image` : null,
    createdAt: update.createdAt,
  }
}

// `file` is multer's { buffer, originalname }, or undefined for a text-only
// post. Everyone connected sees the new post at once.
export async function createUpdate(authorId, { text }, file) {
  if (!text && !file) throw new AppError(400, 'Write something or add a photo')

  let imageFileId = null
  if (file) {
    // Checked from the file's own bytes, like every other upload - never
    // from its name or what the browser claims.
    const type = detectFileType(file.buffer, file.originalname)
    if (!type || !IMAGE_TYPES.includes(type.mime)) {
      throw new AppError(400, 'The photo must be a JPEG, PNG, WebP or GIF image')
    }
    imageFileId = await saveFile(file.buffer, {
      filename: 'update-image',
      contentType: type.mime,
      metadata: { purpose: 'update', owner: authorId },
    })
  }

  let update
  try {
    update = await Update.create({ text, imageFileId, author: authorId })
  } catch (err) {
    await deleteFile(imageFileId) // don't leave an orphaned photo behind
    throw err
  }

  const view = updateView(update)
  emitToAll('update:new', { update: view })
  notifyUpdatePosted(view) // and a push to everyone who has PingMe closed
  return view
}

// The same keyset pagination as chat history: newest first in the query,
// one extra row to know whether older posts exist, then oldest -> newest
// for display. Never skip/offset.
export async function listUpdates({ before, limit }) {
  const filter = before ? { _id: { $lt: before } } : {}
  const rows = await Update.find(filter)
    .sort({ _id: -1 })
    .limit(limit + 1)
  const hasMore = rows.length > limit
  return { updates: rows.slice(0, limit).reverse().map(updateView), hasMore }
}

// What the pinned "PingMe" row in the chat list needs: the latest post for
// its preview, and how many posts I have not read yet.
export async function getSummary(meId) {
  const [latest, me] = await Promise.all([
    Update.findOne().sort({ _id: -1 }),
    User.findById(meId, { updatesReadUpTo: 1 }),
  ])
  const pointer = me?.updatesReadUpTo
  const unreadCount = await Update.countDocuments(pointer ? { _id: { $gt: pointer } } : {})
  return { latest: latest ? updateView(latest) : null, unreadCount }
}

// Moves my read pointer forward to `upToId`. ONE atomic update whose filter
// is the "only moves forward" rule, so two tabs racing can never move it
// back. My other tabs are told, so their badge clears too.
export async function markRead(meId, upToId) {
  if (!(await Update.exists({ _id: upToId }))) throw new AppError(404, 'Update not found')

  const result = await User.updateOne(
    { _id: meId, $or: [{ updatesReadUpTo: null }, { updatesReadUpTo: { $lt: upToId } }] },
    { updatesReadUpTo: upToId },
  )
  if (result.modifiedCount > 0) emitToUser(meId, 'updates:read', { upToId: String(upToId) })
}

// Deletes the post for everyone, and its photo.
export async function deleteUpdate(updateId) {
  const update = await Update.findOneAndDelete({ _id: updateId })
  if (!update) throw new AppError(404, 'Update not found')
  await deleteFile(update.imageFileId)
  emitToAll('update:deleted', { id: String(update._id) })
}

// What the image route needs to stream a post's photo.
export async function getImage(updateId) {
  const update = await Update.findById(updateId)
  const info = update?.imageFileId ? await getFileInfo(update.imageFileId) : null
  if (!info) throw new AppError(404, 'Photo not found')
  return { fileId: update.imageFileId, size: info.length, mimeType: info.contentType }
}
