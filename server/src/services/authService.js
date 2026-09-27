import crypto from 'node:crypto'

import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

import { env, isProduction } from '../config/env.js'
import { User } from '../models/User.js'
import { AppError } from '../utils/AppError.js'
import { sendPasswordResetEmail } from './emailService.js'
import { getSettings } from './settingsService.js'

const BCRYPT_COST = 12
const SESSION_DAYS = 7

export const SESSION_COOKIE = 'token'

// httpOnly: page JavaScript cannot read the cookie, so an XSS bug cannot
//   steal the session.
// sameSite 'lax': the browser does not send it on cross-site POSTs, which
//   blocks CSRF.
// secure in production: only ever sent over HTTPS.
export const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: isProduction,
  path: '/',
  maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
}

// Used to make a failed login for an unknown user take as long as a wrong
// password. Without it, the response time would reveal which usernames exist.
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-not-a-real-password', BCRYPT_COST)

// Both checks are admin-editable settings, not hardcoded, so either can be
// changed from the admin panel without a code change or a deploy.
async function assertRegistrationAllowed(email) {
  const settings = await getSettings()

  if (!settings.registrationOpen) throw new AppError(403, 'Registration is currently closed')

  const domain = email.split('@')[1] ?? ''
  const allowed = settings.allowedEmailDomains.some((d) => domain === d.toLowerCase())
  if (!allowed) {
    const list = settings.allowedEmailDomains.join(', ')
    throw new AppError(400, `You can only sign up with an email ending in: ${list}`)
  }
}

export async function register({ username, displayName, email, password }) {
  await assertRegistrationAllowed(email)

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST)

  // No "does this username exist?" check first: two sign-ups at the same
  // moment could both pass it. The unique index is the only reliable guard,
  // so we just insert and translate the duplicate-key error (code 11000).
  try {
    return await User.create({ username, displayName, email, passwordHash })
  } catch (err) {
    if (err.code === 11000) {
      if (err.keyPattern?.username) throw new AppError(409, 'Username already taken')
      if (err.keyPattern?.email) throw new AppError(409, 'Email already registered')
    }
    throw err
  }
}

export async function login({ identifier, password }) {
  // The identifier is already lowercased by zod. A username can never contain
  // "@", so one query covers both cases.
  const user = await User.findOne({
    $or: [{ username: identifier }, { email: identifier }],
  }).select('+passwordHash')

  const ok = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH)

  // Same status and message for "no such user" and "wrong password", so the
  // login form cannot be used to discover which accounts exist.
  if (!user || !ok) throw new AppError(401, 'Invalid credentials')

  // Checked AFTER the password, so this can never be used to discover
  // whether an unknown identifier belongs to a suspended account either.
  if (user.suspended) throw new AppError(403, 'Your account has been suspended')

  return user
}

export function signToken(userId) {
  // `ts` is our own millisecond-precision issued-at time. JWT's own `iat` is
  // only ever whole seconds, which is not fine enough here: a cookie
  // reissued moments after a password change (to keep the current tab
  // logged in) could round down to the very second `passwordChangedAt`
  // falls in, making the two indistinguishable. `ts` never has that problem.
  return jwt.sign({ sub: String(userId), ts: Date.now() }, env.JWT_SECRET, {
    expiresIn: `${SESSION_DAYS}d`,
  })
}

// Returns the decoded payload { sub, ts, ... } for a valid token, or null
// for a missing, expired or forged one. Pinning the algorithm stops a token
// claiming a weaker one.
export function verifyToken(token) {
  if (!token) return null
  try {
    return jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] })
  } catch {
    return null
  }
}

// Shared by requireAuth (REST) and socketAuth (Socket.IO), so both check a
// session in exactly the same way. A deleted user's old token stops working.
export async function userFromToken(token) {
  const decoded = verifyToken(token)
  if (!decoded) return null

  const user = await User.findById(decoded.sub)
  if (!user) return null

  // A suspended account's existing sessions stop working the instant an
  // admin suspends it, not just at its next login (see adminService and
  // socket/emitter.js's disconnectUser, which closes any ALREADY-open socket
  // at the same moment - this covers a fresh REST call or socket handshake).
  if (user.suspended) return null

  // A token issued before the password was last changed or reset is stale -
  // this is what signs out every OTHER device the moment the password
  // changes, without needing a server-side list of valid tokens. Both sides
  // are compared to the millisecond (see signToken's `ts`), so a cookie
  // reissued immediately after the change is never mistaken for an old one.
  if (user.passwordChangedAt && decoded.ts < user.passwordChangedAt.getTime()) {
    return null
  }
  return user
}

// ---------------------------------------------------------------------------
// Password reset ("forgot password")
// ---------------------------------------------------------------------------

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000 // 1 hour

// Never store the raw token - only its hash, the same reasoning as
// passwordHash. A stolen database still can't be used to reset accounts.
const hashResetToken = (token) => crypto.createHash('sha256').update(token).digest('hex')

// Always resolves, whether or not the email belongs to an account - the
// controller sends the same response either way, so this can never be used
// to check who has an account (the same reasoning as login's identical 401
// for "wrong password" and "no such user").
export async function requestPasswordReset(email) {
  const user = await User.findOne({ email })
  if (!user) return

  const token = crypto.randomBytes(32).toString('hex')
  user.resetPasswordTokenHash = hashResetToken(token)
  user.resetPasswordExpires = new Date(Date.now() + RESET_TOKEN_TTL_MS)
  await user.save()

  const resetUrl = `${env.APP_URL}/reset-password?token=${token}&email=${encodeURIComponent(email)}`
  await sendPasswordResetEmail(user, resetUrl)
}

export async function resetPassword({ email, token, password }) {
  const user = await User.findOne({ email }).select('+resetPasswordTokenHash +resetPasswordExpires')
  const invalid = () => {
    throw new AppError(400, 'That reset link is invalid or has expired')
  }

  if (!user || !user.resetPasswordTokenHash || !user.resetPasswordExpires) invalid()
  if (user.resetPasswordExpires < new Date()) invalid()
  if (user.resetPasswordTokenHash !== hashResetToken(token)) invalid()

  user.passwordHash = await bcrypt.hash(password, BCRYPT_COST)
  user.passwordChangedAt = new Date()
  // Cleared, not just expired-in-place: a link can only ever be used once.
  user.resetPasswordTokenHash = null
  user.resetPasswordExpires = null
  await user.save()
}

// ---------------------------------------------------------------------------
// Change password (while logged in, from the profile)
// ---------------------------------------------------------------------------

export async function changePassword(meId, { currentPassword, newPassword }) {
  const user = await User.findById(meId).select('+passwordHash')

  // 400, not 401: the request already passed requireAuth, so the SESSION is
  // valid - this is a rejected form value, not an authentication failure.
  // The client treats any other 401 as "your session expired, log out",
  // which would otherwise sign the user out instead of showing this inline.
  const ok = await bcrypt.compare(currentPassword, user.passwordHash)
  if (!ok) throw new AppError(400, 'Current password is incorrect')

  user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST)
  user.passwordChangedAt = new Date()
  await user.save()
  return user
}
