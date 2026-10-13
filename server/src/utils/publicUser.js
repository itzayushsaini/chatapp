import { USERNAME_COOLDOWN_DAYS } from '../models/User.js'

const DAY_MS = 24 * 60 * 60 * 1000

// Built by hand, so a field added to the model later can never leak
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

// The only place email is ever sent, and only to its owner
export function selfUser(user) {
  return {
    ...publicUser(user),
    email: user.email,
    usernameChangeAllowedAt: user.usernameChangedAt
      ? new Date(user.usernameChangedAt.getTime() + USERNAME_COOLDOWN_DAYS * DAY_MS)
      : null,
    isAdmin: user.isAdmin,
    theme: user.theme ?? 'light',
    authProvider: user.authProvider ?? 'password',
    googleLinked: Boolean(user.googleId),
    photoRequired: Boolean(user.photoRequired),
  }
}
