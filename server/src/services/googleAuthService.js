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

// Must match the Google Cloud Console setting exactly; goes via APP_URL so the cookie is same-origin
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
    // so a shared computer doesn't silently reuse the last Google account
    prompt: 'select_account',
  })
  return `${AUTH_URL}?${params}`
}

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

  // an unverified email could belong to anyone, so it must never claim an account
  if (!profile.sub || !profile.email || !profile.email_verified) {
    throw new AppError(401, 'Google sign-in failed')
  }
  return { googleId: profile.sub, email: profile.email.toLowerCase(), name: profile.name }
}

function usernameCandidates(email) {
  let base = email.split('@')[0].toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 15)
  if (base.length < 3) base = `${base}user`.slice(0, 15)
  const candidates = [base]
  for (let i = 0; i < 5; i++) candidates.push(`${base}${Math.floor(1000 + Math.random() * 9000)}`)
  return candidates.filter((name) => USERNAME_REGEX.test(name))
}

export async function findOrCreateGoogleUser({ googleId, email, name }) {
  let user = await User.findOne({ googleId })
  if (!user) {
    user = await User.findOneAndUpdate({ email }, { $set: { googleId } }, { new: true })
  }

  if (!user) {
    const settings = await getSettings()
    // the email domain rule is skipped: a verified Google account isn't a throwaway address
    if (!settings.registrationOpen) throw new AppError(403, 'Registration is currently closed')

    const displayName = (name || email.split('@')[0]).trim().slice(0, 40) || 'PingMe user'
    for (const username of usernameCandidates(email)) {
      try {
        user = await User.create({ username, displayName, email, googleId, authProvider: 'google', photoRequired: true })
        break
      } catch (err) {
        if (err.code === 11000 && err.keyPattern?.username) continue
        throw err
      }
    }
    if (!user) throw new AppError(409, 'Could not create an account - please try again')
  }

  if (user.suspended) throw new AppError(403, 'Your account has been suspended')
  return user
}
