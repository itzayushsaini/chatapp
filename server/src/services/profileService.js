import { User, USERNAME_COOLDOWN_DAYS } from '../models/User.js'
import { emitToUser } from '../socket/emitter.js'
import { AppError } from '../utils/AppError.js'
import { detectFileType } from '../utils/fileType.js'
import { publicUser, selfUser } from '../utils/publicUser.js'
import { getContactIds } from './friendService.js'
import { deleteFile, getFileInfo, saveFile } from './storageService.js'

const COOLDOWN_MS = USERNAME_COOLDOWN_DAYS * 24 * 60 * 60 * 1000

const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

// Tells everyone who has me in a list (friends, pending requests) about my
// new name / bio / picture, so their sidebar and chat header update at once.
// My own other tabs get the full selfUser; everyone else the public shape.
async function announce(user) {
  emitToUser(user._id, 'user:updated', { user: selfUser(user) })
  for (const contactId of await getContactIds(user._id)) {
    emitToUser(contactId, 'user:updated', { user: publicUser(user) })
  }
}

// Any of displayName, bio, username and theme may be given; the rest stay as
// they are. Returns the updated user document.
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
    // The cooldown is part of the SAME atomic update: "only if I have never
    // changed it, or the last change was 30+ days ago". Two changes sent at
    // once cannot both pass, just like accepting a friend request twice.
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
    // As at registration, the unique index is the real guard against two
    // people taking the same username at the same moment.
    if (err.code === 11000 && err.keyPattern?.username) {
      throw new AppError(409, 'Username already taken')
    }
    throw err
  }

  if (!updated) {
    // The filter did not match, so the cooldown has not passed yet.
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

// `file` is multer's { buffer, originalname }. Returns the updated user.
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

  // Swap in the new picture, then delete the old one. { new: false } returns
  // the document as it was BEFORE the update, so we know which file to delete.
  const before = await User.findOneAndUpdate({ _id: meId }, { avatarFileId: fileId }, { new: false })
  await deleteFile(before.avatarFileId)

  const updated = await User.findById(meId)
  await announce(updated)
  return updated
}

export async function removeAvatar(meId) {
  const before = await User.findOneAndUpdate({ _id: meId }, { avatarFileId: null }, { new: false })
  await deleteFile(before.avatarFileId)

  const updated = await User.findById(meId)
  await announce(updated)
  return updated
}

// What the avatar route needs to stream the picture. Any logged-in user may
// see it: the picture is part of the public profile shown in search results.
export async function getAvatar(userId) {
  const user = await User.findById(userId)
  const info = user?.avatarFileId ? await getFileInfo(user.avatarFileId) : null
  if (!info) throw new AppError(404, 'No profile picture')

  return { fileId: user.avatarFileId, size: info.length, mimeType: info.contentType }
}
