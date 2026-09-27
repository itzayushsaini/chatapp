import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

import { env, isProduction } from '../config/env.js'
import { User } from '../models/User.js'
import { AppError } from '../utils/AppError.js'

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

export async function register({ username, displayName, email, password }) {
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

  return user
}

export function signToken(userId) {
  return jwt.sign({ sub: String(userId) }, env.JWT_SECRET, { expiresIn: `${SESSION_DAYS}d` })
}

// Returns the user id from a valid token, or null for a missing, expired or
// forged one. Pinning the algorithm stops a token claiming a weaker one.
export function verifyToken(token) {
  if (!token) return null
  try {
    return jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] }).sub
  } catch {
    return null
  }
}

// Shared by requireAuth (REST) and socketAuth (Socket.IO), so both check a
// session in exactly the same way. A deleted user's old token stops working.
export async function userFromToken(token) {
  const userId = verifyToken(token)
  if (!userId) return null
  return User.findById(userId)
}
