import { Update } from '../models/Update.js'
import { User } from '../models/User.js'
import { emitToAll, emitToUser } from '../socket/emitter.js'
import { AppError } from '../utils/AppError.js'
import { detectFileType } from '../utils/fileType.js'
import { notifyUpdatePosted } from './pushService.js'
import { deleteFile, getFileInfo, saveFile } from './storageService.js'

export const UPDATE_IMAGE_MAX_BYTES = 10 * 1024 * 1024
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

// The author is never sent; to users every post comes from "PingMe"
export function updateView(update) {
  return {
    id: String(update._id),
    text: update.text,
    imageUrl: update.imageFileId ? `/api/updates/${update._id}/image` : null,
    createdAt: update.createdAt,
  }
}

export async function createUpdate(authorId, { text }, file) {
  if (!text && !file) throw new AppError(400, 'Write something or add a photo')

  let imageFileId = null
  if (file) {
    // type comes from the bytes, never the name or what the browser claims
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
    await deleteFile(imageFileId)
    throw err
  }

  const view = updateView(update)
  emitToAll('update:new', { update: view })
  notifyUpdatePosted(view)
  return view
}

export async function listUpdates({ before, limit }) {
  const filter = before ? { _id: { $lt: before } } : {}
  const rows = await Update.find(filter)
    .sort({ _id: -1 })
    .limit(limit + 1)
  const hasMore = rows.length > limit
  return { updates: rows.slice(0, limit).reverse().map(updateView), hasMore }
}

export async function getSummary(meId) {
  const [latest, me] = await Promise.all([
    Update.findOne().sort({ _id: -1 }),
    User.findById(meId, { updatesReadUpTo: 1 }),
  ])
  const pointer = me?.updatesReadUpTo
  const unreadCount = await Update.countDocuments(pointer ? { _id: { $gt: pointer } } : {})
  return { latest: latest ? updateView(latest) : null, unreadCount }
}

// One atomic update that only moves the pointer forward, so racing tabs can't move it back
export async function markRead(meId, upToId) {
  if (!(await Update.exists({ _id: upToId }))) throw new AppError(404, 'Update not found')

  const result = await User.updateOne(
    { _id: meId, $or: [{ updatesReadUpTo: null }, { updatesReadUpTo: { $lt: upToId } }] },
    { updatesReadUpTo: upToId },
  )
  if (result.modifiedCount > 0) emitToUser(meId, 'updates:read', { upToId: String(upToId) })
}

export async function deleteUpdate(updateId) {
  const update = await Update.findOneAndDelete({ _id: updateId })
  if (!update) throw new AppError(404, 'Update not found')
  await deleteFile(update.imageFileId)
  emitToAll('update:deleted', { id: String(update._id) })
}

export async function getImage(updateId) {
  const update = await Update.findById(updateId)
  const info = update?.imageFileId ? await getFileInfo(update.imageFileId) : null
  if (!info) throw new AppError(404, 'Photo not found')
  return { fileId: update.imageFileId, size: info.length, mimeType: info.contentType }
}
