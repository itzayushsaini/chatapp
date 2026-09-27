import { USERNAME_COOLDOWN_DAYS } from '../models/User.js'

const DAY_MS = 24 * 60 * 60 * 1000

// The ONLY fields ever sent about another user. Building the object by hand
// (instead of sending the document and deleting fields) means a field added
// to the model later can never leak by accident.
//
// avatarUrl ends in ?v=<file id>. A new picture gets a new file id, so the
// URL changes and browsers fetch it again; an unchanged picture keeps its URL
// and can be cached for a long time.
export function publicUser(user) {
  const id = String(user._id)
  return {
    id,
    username: user.username,
    displayName: user.displayName,
    bio: user.bio ?? '',
    avatarUrl: user.avatarFileId ? `/api/users/${id}/avatar?v=${user.avatarFileId}` : null,
  }
}

// My own profile, returned by /api/auth/me, register, login and profile
// updates. This is the only place email is ever sent, and only to its owner.
export function selfUser(user) {
  return {
    ...publicUser(user),
    email: user.email,
    // When I may next change my username (null = any time), so the profile
    // form can say so instead of letting me try and fail.
    usernameChangeAllowedAt: user.usernameChangedAt
      ? new Date(user.usernameChangedAt.getTime() + USERNAME_COOLDOWN_DAYS * DAY_MS)
      : null,
  }
}
