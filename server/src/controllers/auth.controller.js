import crypto from 'node:crypto'

import * as authService from '../services/authService.js'
import * as googleAuth from '../services/googleAuthService.js'
import { AppError } from '../utils/AppError.js'
import { selfUser } from '../utils/publicUser.js'

// The random value that proves Google's redirect back belongs to a sign-in
// THIS browser started - without it, someone could trick a victim's browser
// into completing a sign-in as the attacker (login CSRF).
const STATE_COOKIE = 'oauth_state'
const stateCookieOptions = {
  ...authService.baseCookieOptions,
  path: '/api/auth/google',
  maxAge: 10 * 60 * 1000,
}

// Controllers stay thin: read validated input, call a service, send a
// response. The token goes ONLY into the httpOnly cookie, never the body.
function startSession(res, user, remember) {
  res.cookie(
    authService.SESSION_COOKIE,
    authService.signToken(user._id, { remember }),
    authService.sessionCookieOptions(remember),
  )
}

// A brand-new account stays logged in like "Remember me" was ticked - the
// person has just proven they own it, and the register form has no checkbox.
export async function register(req, res) {
  const user = await authService.register(req.valid.body)
  startSession(res, user, true)
  res.status(201).json({ user: selfUser(user) })
}

export async function login(req, res) {
  const user = await authService.login(req.valid.body)
  startSession(res, user, req.valid.body.rememberMe)
  res.json({ user: selfUser(user) })
}

// Step 1: off to Google. These two are normal page navigations (a link, then
// Google's redirect back), not fetch calls - so they answer with redirects,
// and every failure lands back on /login with a short error code the login
// page turns into a message.
export function googleStart(req, res) {
  if (!googleAuth.googleEnabled()) return res.redirect('/login?error=google_unavailable')
  const state = crypto.randomBytes(16).toString('hex')
  res.cookie(STATE_COOKIE, state, stateCookieOptions)
  res.redirect(googleAuth.authorizationUrl(state))
}

const ERROR_CODES = {
  'Registration is currently closed': 'registration_closed',
  'Your account has been suspended': 'suspended',
}

export async function googleCallback(req, res) {
  const { code, state, error } = req.valid.query
  const expected = req.cookies[STATE_COOKIE]
  res.clearCookie(STATE_COOKIE, { ...authService.baseCookieOptions, path: stateCookieOptions.path })

  // Cancelled on Google's page, or a state that does not match this browser.
  if (!googleAuth.googleEnabled() || error || !code || !state || !expected || state !== expected) {
    return res.redirect('/login?error=google_failed')
  }

  try {
    const profile = await googleAuth.fetchGoogleProfile(code)
    const user = await googleAuth.findOrCreateGoogleUser(profile)
    // Google sign-in behaves like "Remember me" ticked, the same as signing up.
    startSession(res, user, true)
    res.redirect('/')
  } catch (err) {
    if (!(err instanceof AppError)) console.error('Google sign-in failed:', err)
    res.redirect(`/login?error=${ERROR_CODES[err.message] ?? 'google_failed'}`)
  }
}

export function logout(req, res) {
  // clearCookie needs the same path/sameSite/secure to match the cookie.
  res.clearCookie(authService.SESSION_COOKIE, authService.baseCookieOptions)
  res.status(204).end()
}

export function me(req, res) {
  res.json({ user: selfUser(req.user) })
}

export async function forgotPassword(req, res) {
  await authService.requestPasswordReset(req.valid.body.email)
  // The exact same response whether or not the email exists.
  res.json({ message: "If an account exists for that email, we've sent a password reset link." })
}

export async function resetPassword(req, res) {
  await authService.resetPassword(req.valid.body)
  res.json({ message: 'Password updated. Please log in.' })
}

export async function changePassword(req, res) {
  const user = await authService.changePassword(req.user._id, req.valid.body)
  // Reissue the cookie so THIS tab stays logged in - every other device
  // is signed out on its next request (see authService.userFromToken).
  // Keep whatever "Remember me" choice the current session was made with;
  // a token from before that choice existed counts as remembered.
  const current = authService.verifyToken(req.cookies[authService.SESSION_COOKIE])
  startSession(res, user, current?.rm ?? true)
  res.json({ message: 'Password changed. Your other devices have been logged out.' })
}
