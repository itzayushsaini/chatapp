import { User, USERNAME_COOLDOWN_DAYS } from '../models/User.js'
import { emitToUser } from '../socket/emitter.js'
import { AppError } from '../utils/AppError.js'
import { detectFileType } from '../utils/fileType.js'
import { publicUser, selfUser } from '../utils/publicUser.js'
import { getContactIds } from './friendService.js'
import { deleteFile, getFileInfo, saveFile } from './storageService.js'

const COOLDOWN_MS = USERNAME_COOLDOWN_DAYS * 24 * 60 * 60 * 1000

const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

async function announce(user) {
  emitToUser(user._id, 'user:updated', { user: selfUser(user) })
  for (const contactId of await getContactIds(user._id)) {
    emitToUser(contactId, 'user:updated', { user: publicUser(user) })
  }
}

export async function updateProfile(meId, { displayName, bio, username, theme }) {
  const me = await User.findById(meId)
  const changes = {}
  if (displayName !== undefined) changes.displayName = displayName
  if (bio !== undefined) changes.bio = bio
  if (theme !== undefined) changes.theme = theme

  const filter = { _id: meId }
  const changingUsername = username !== undefined && username !== me.username
  if (changingUsername) {
    changes.username = username
    changes.usernameChangedAt = new Date()
    // cooldown is in the same atomic filter, so two changes at once can't both pass
    filter.$or = [
      { usernameChangedAt: null },
      { usernameChangedAt: { $lte: new Date(Date.now() - COOLDOWN_MS) } },
    ]
  }

  if (Object.keys(changes).length === 0) return me

  let updated
  try {
    updated = await User.findOneAndUpdate(filter, { $set: changes }, { new: true, runValidators: true })
  } catch (err) {
    if (err.code === 11000 && err.keyPattern?.username) {
      throw new AppError(409, 'Username already taken')
    }
    throw err
  }

  if (!updated) {
    // filter didn't match, so the cooldown hasn't passed
    const fresh = await User.findById(meId)
    const allowedAt = new Date(fresh.usernameChangedAt.getTime() + COOLDOWN_MS)
    throw new AppError(
      429,
      `You can change your username again on ${allowedAt.toISOString().slice(0, 10)}`,
    )
  }

  await announce(updated)
  return updated
}

export async function setAvatar(meId, file) {
  const type = detectFileType(file.buffer, file.originalname)
  if (!type || !AVATAR_TYPES.includes(type.mime)) {
    throw new AppError(400, 'Profile picture must be a JPEG, PNG, WebP or GIF image')
  }

  const fileId = await saveFile(file.buffer, {
    filename: `avatar-${meId}`,
    contentType: type.mime,
    metadata: { purpose: 'avatar', owner: meId },
  })

  // new: false returns the old document, so we know which file to delete
  const before = await User.findOneAndUpdate({ _id: meId }, { avatarFileId: fileId }, { new: false })
  await deleteFile(before.avatarFileId)

  const updated = await User.findById(meId)
  await announce(updated)
  return updated
}

export async function removeAvatar() {
  throw new AppError(400, 'A profile photo is required. You can change it, but not remove it.')
}

export async function getAvatar(userId) {
  const user = await User.findById(userId)
  const info = user?.avatarFileId ? await getFileInfo(user.avatarFileId) : null
  if (!info) throw new AppError(404, 'No profile picture')

  return { fileId: user.avatarFileId, size: info.length, mimeType: info.contentType }
}
