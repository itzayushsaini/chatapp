// "Continue with Google", using Google's standard OAuth 2.0 / OpenID Connect
// "authorization code" flow, with plain fetch() calls - no SDK, the same
// approach as emailService.js:
//
//   1. /api/auth/google          -> send the browser to Google's sign-in page,
//                                   with a random `state` also stored in a cookie
//   2. Google sends it back to   -> /api/auth/google/callback?code=...&state=...
//   3. The server checks `state`, swaps `code` for a token (server to server,
//      using the client secret), asks Google who this is, then finds or
//      creates the PingMe account and starts a normal session cookie.
//
// The browser never sees the client secret or Google's tokens.
import { env } from '../config/env.js'
import { User, USERNAME_REGEX } from '../models/User.js'
import { AppError } from '../utils/AppError.js'
import { getSettings } from './settingsService.js'

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo'

export function googleEnabled() {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)
}

// Must match EXACTLY what is registered in Google Cloud Console. It goes
// through the page's own origin (APP_URL), so in development Vite proxies it
// to Express and the session cookie lands on the same origin as the app.
export function redirectUri() {
  return `${env.APP_URL}/api/auth/google/callback`
}

export function authorizationUrl(state) {
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    // Always show the account chooser, so a shared computer does not
    // silently reuse whoever was last signed in to Google.
    prompt: 'select_account',
  })
  return `${AUTH_URL}?${params}`
}

// Steps 3a and 3b: code -> access token -> { sub, email, name }.
export async function fetchGoogleProfile(code) {
  const tokenRes = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri(),
      grant_type: 'authorization_code',
    }),
  })
  if (!tokenRes.ok) throw new AppError(401, 'Google sign-in failed')
  const { access_token: accessToken } = await tokenRes.json()

  const profileRes = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!profileRes.ok) throw new AppError(401, 'Google sign-in failed')
  const profile = await profileRes.json()

  // An email Google has not verified could belong to anyone - never let it
  // log into (or claim) an account.
  if (!profile.sub || !profile.email || !profile.email_verified) {
    throw new AppError(401, 'Google sign-in failed')
  }
  return { googleId: profile.sub, email: profile.email.toLowerCase(), name: profile.name }
}

// A username for a brand-new Google account: the part of the email before
// "@", cleaned up to the same rules as a hand-typed one. If it is taken, add
// a few random digits. The person can change it later from their profile.
function usernameCandidates(email) {
  let base = email.split('@')[0].toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 15)
  if (base.length < 3) base = `${base}user`.slice(0, 15)
  const candidates = [base]
  for (let i = 0; i < 5; i++) candidates.push(`${base}${Math.floor(1000 + Math.random() * 9000)}`)
  return candidates.filter((name) => USERNAME_REGEX.test(name))
}

// Returns the PingMe user to log in as.
//
// - Already signed in with Google before: that account.
// - A PingMe account with the same email (made with a password): link it -
//   Google has verified the email, so it is the same person.
// - Otherwise: a new account. Registration must be open, but the allowed
//   email domains rule is NOT applied - it exists to stop throwaway
//   addresses, and a Google account with a verified email is not one.
export async function findOrCreateGoogleUser({ googleId, email, name }) {
  let user = await User.findOne({ googleId })
  if (!user) {
    user = await User.findOneAndUpdate({ email }, { $set: { googleId } }, { new: true })
  }

  if (!user) {
    const settings = await getSettings()
    if (!settings.registrationOpen) throw new AppError(403, 'Registration is currently closed')

    const displayName = (name || email.split('@')[0]).trim().slice(0, 40) || 'PingMe user'
    for (const username of usernameCandidates(email)) {
      try {
        user = await User.create({ username, displayName, email, googleId, authProvider: 'google' })
        break
      } catch (err) {
        // Username taken - try the next candidate. Anything else is real.
        if (err.code === 11000 && err.keyPattern?.username) continue
        throw err
      }
    }
    if (!user) throw new AppError(409, 'Could not create an account - please try again')
  }

  if (user.suspended) throw new AppError(403, 'Your account has been suspended')
  return user
}
