import crypto from 'node:crypto'

import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

import { env, isProduction } from '../config/env.js'
import { User } from '../models/User.js'
import { AppError } from '../utils/AppError.js'
import { sendPasswordResetEmail } from './emailService.js'
import { removeAllFor } from './pushService.js'
import { getSettings } from './settingsService.js'

const BCRYPT_COST = 12
const DAY_MS = 24 * 60 * 60 * 1000
const SESSION_DAYS = 7
const REMEMBER_DAYS = 30

export const SESSION_COOKIE = 'token'

// httpOnly so XSS can't read it; sameSite lax blocks CSRF from cross-site POSTs
export const baseCookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: isProduction,
  path: '/',
}

export function sessionCookieOptions(remember) {
  return remember ? { ...baseCookieOptions, maxAge: REMEMBER_DAYS * DAY_MS } : { ...baseCookieOptions }
}

// Makes an unknown user take as long as a wrong password, so timing can't reveal who exists
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-not-a-real-password', BCRYPT_COST)

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

  // No "check then insert": the unique index is the only race-safe guard
  try {
    return await User.create({ username, displayName, email, passwordHash, photoRequired: true })
  } catch (err) {
    if (err.code === 11000) {
      if (err.keyPattern?.username) throw new AppError(409, 'Username already taken')
      if (err.keyPattern?.email) throw new AppError(409, 'Email already registered')
    }
    throw err
  }
}

export async function login({ identifier, password }) {
  const user = await User.findOne({
    $or: [{ username: identifier }, { email: identifier }],
  }).select('+passwordHash')

  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH)

  // Same error for unknown user and wrong password, so nobody can tell which accounts exist
  if (!user || !ok) throw new AppError(401, 'Invalid credentials')

  // checked after the password so it doesn't leak which accounts are suspended
  if (user.suspended) throw new AppError(403, 'Your account has been suspended')

  return user
}

export function signToken(userId, { remember = true } = {}) {
  // ts is in ms because JWT's iat is whole seconds, too coarse to compare with passwordChangedAt
  return jwt.sign({ sub: String(userId), ts: Date.now(), rm: remember }, env.JWT_SECRET, {
    expiresIn: `${remember ? REMEMBER_DAYS : SESSION_DAYS}d`,
  })
}

export function verifyToken(token) {
  if (!token) return null
  try {
    return jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] })
  } catch {
    return null
  }
}

export async function userFromToken(token) {
  const decoded = verifyToken(token)
  if (!decoded) return null

  const user = await User.findById(decoded.sub)
  if (!user) return null

  // suspension ends existing sessions right away, not just at the next login
  if (user.suspended) return null

  // a token from before the last password change is stale; this signs out other devices
  if (user.passwordChangedAt && decoded.ts < user.passwordChangedAt.getTime()) {
    return null
  }
  return user
}

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000

// Only the hash is stored, so a leaked database can't be used to reset accounts
const hashResetToken = (token) => crypto.createHash('sha256').update(token).digest('hex')

// Behaves the same whether or not the email has an account, so it can't reveal who does
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
  user.resetPasswordTokenHash = null
  user.resetPasswordExpires = null
  await user.save()
  await removeAllFor(user._id)
}

export async function changePassword(meId, { currentPassword, newPassword }) {
  const user = await User.findById(meId).select('+passwordHash')

  if (!user.passwordHash) {
    throw new AppError(
      400,
      'This account signs in with Google and has no password yet - use "Forgot password" to set one',
    )
  }

  // 400, not 401: the client treats a 401 as an expired session and logs out
  const ok = await bcrypt.compare(currentPassword, user.passwordHash)
  if (!ok) throw new AppError(400, 'Current password is incorrect')

  user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST)
  user.passwordChangedAt = new Date()
  await user.save()
  await removeAllFor(user._id)
  return user
}
