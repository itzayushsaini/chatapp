import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import app from '../src/app.js'
import { env } from '../src/config/env.js'
import { User } from '../src/models/User.js'
import { makeAdmin, registerUser } from './helpers.js'

// Google itself is never contacted: fetch() is replaced for each test with a
// fake that answers the token and profile requests the way Google would.
function fakeGoogle(profile, { tokenOk = true } = {}) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    if (String(url).includes('oauth2.googleapis.com/token')) {
      return new Response(JSON.stringify({ access_token: 'fake-token' }), { status: tokenOk ? 200 : 400 })
    }
    if (String(url).includes('openidconnect.googleapis.com')) {
      return new Response(JSON.stringify(profile), { status: 200 })
    }
    throw new Error(`unexpected fetch ${url}`)
  })
}

const NEHA = { sub: 'google-123', email: 'Neha.Sharma@gmail.com', email_verified: true, name: 'Neha Sharma' }

// Runs the whole round trip in one "browser" (a supertest agent keeps
// cookies): start -> Google (skipped) -> callback. Returns the agent and the
// callback's response.
async function signInWithGoogle(profile, options) {
  const agent = request.agent(app)
  const start = await agent.get('/api/auth/google')
  const state = new URL(start.headers.location).searchParams.get('state')
  fakeGoogle(profile, options)
  const callback = await agent.get(`/api/auth/google/callback?code=abc&state=${state}`)
  return { agent, callback }
}

beforeEach(() => {
  env.GOOGLE_CLIENT_ID = 'test-client-id'
  env.GOOGLE_CLIENT_SECRET = 'test-client-secret'
})

afterEach(() => {
  delete env.GOOGLE_CLIENT_ID
  delete env.GOOGLE_CLIENT_SECRET
  vi.restoreAllMocks()
})

describe('GET /api/auth/google', () => {
  it('redirects to Google with a state, and remembers the state in a cookie', async () => {
    const res = await request(app).get('/api/auth/google')

    expect(res.status).toBe(302)
    const url = new URL(res.headers.location)
    expect(url.origin).toBe('https://accounts.google.com')
    expect(url.searchParams.get('client_id')).toBe('test-client-id')
    expect(url.searchParams.get('redirect_uri')).toBe(`${env.APP_URL}/api/auth/google/callback`)
    expect(url.searchParams.get('scope')).toBe('openid email profile')
    const state = url.searchParams.get('state')
    expect(state).toMatch(/^[a-f0-9]{32}$/)
    expect(res.headers['set-cookie'][0]).toMatch(new RegExp(`^oauth_state=${state};.*HttpOnly`, 'i'))
  })

  it('goes back to the login page when Google sign-in is not configured', async () => {
    delete env.GOOGLE_CLIENT_ID
    const res = await request(app).get('/api/auth/google')
    expect(res.status).toBe(302)
    expect(res.headers.location).toBe('/login?error=google_unavailable')
  })
})

describe('GET /api/auth/google/callback', () => {
  it('creates an account for a new person and logs them in', async () => {
    const { agent, callback } = await signInWithGoogle(NEHA)

    expect(callback.status).toBe(302)
    expect(callback.headers.location).toBe('/')
    const me = await agent.get('/api/auth/me')
    expect(me.body.user).toMatchObject({
      username: 'neha.sharma',
      displayName: 'Neha Sharma',
      email: 'neha.sharma@gmail.com',
      authProvider: 'google',
      googleLinked: true,
    })
  })

  it('logs the same person into the same account the next time', async () => {
    await signInWithGoogle(NEHA)
    const { agent } = await signInWithGoogle(NEHA)
    const me = await agent.get('/api/auth/me')
    expect(me.body.user.username).toBe('neha.sharma')
    expect(await User.countDocuments()).toBe(1)
  })

  it('picks a different username when the natural one is taken', async () => {
    await registerUser('neha.sharma', { email: 'someone.else@gmail.com' })
    const { agent } = await signInWithGoogle(NEHA)
    const me = await agent.get('/api/auth/me')
    expect(me.body.user.username).toMatch(/^neha\.sharma\d{4}$/)
  })

  it('links to an existing password account with the same email', async () => {
    const { user } = await registerUser('neha', { email: 'neha.sharma@gmail.com' })
    const { agent } = await signInWithGoogle(NEHA)

    const me = await agent.get('/api/auth/me')
    expect(me.body.user.id).toBe(user.id)
    expect(me.body.user.authProvider).toBe('password') // how it was created
    expect(me.body.user.googleLinked).toBe(true)
  })

  it('a Google-only account cannot log in with a password - same 401 as a wrong one', async () => {
    await signInWithGoogle(NEHA)
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'neha.sharma', password: 'anything-at-all' })
    expect(res.status).toBe(401)
    expect(res.body).toEqual({ message: 'Invalid credentials' })
  })

  it('a Google-only account is told how to set a password instead of changing one', async () => {
    const { agent } = await signInWithGoogle(NEHA)
    const res = await agent
      .patch('/api/auth/password')
      .send({ currentPassword: 'whatever', newPassword: 'new-password-123' })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/Forgot password/)
  })

  it('refuses a state that does not match the one this browser started with', async () => {
    const agent = request.agent(app)
    await agent.get('/api/auth/google')
    fakeGoogle(NEHA)
    const res = await agent.get('/api/auth/google/callback?code=abc&state=someone-elses-state')

    expect(res.headers.location).toBe('/login?error=google_failed')
    expect(res.headers['set-cookie']?.some((c) => c.startsWith('token=') && !c.startsWith('token=;'))).toBeFalsy()
    expect(await User.countDocuments()).toBe(0)
  })

  it('refuses when the person cancelled on Google\'s page', async () => {
    const agent = request.agent(app)
    const start = await agent.get('/api/auth/google')
    const state = new URL(start.headers.location).searchParams.get('state')
    const res = await agent.get(`/api/auth/google/callback?error=access_denied&state=${state}`)
    expect(res.headers.location).toBe('/login?error=google_failed')
  })

  it('refuses an email Google has not verified', async () => {
    const { callback } = await signInWithGoogle({ ...NEHA, email_verified: false })
    expect(callback.headers.location).toBe('/login?error=google_failed')
    expect(await User.countDocuments()).toBe(0)
  })

  it('fails cleanly when Google rejects the code', async () => {
    const { callback } = await signInWithGoogle(NEHA, { tokenOk: false })
    expect(callback.headers.location).toBe('/login?error=google_failed')
  })

  it('respects "registration closed" for NEW accounts, but existing ones still get in', async () => {
    await signInWithGoogle(NEHA) // Neha already has an account
    const admin = await registerUser('boss')
    await makeAdmin(admin.user.id)
    await admin.agent.patch('/api/admin/settings').send({ registrationOpen: false })

    const newcomer = await signInWithGoogle({ ...NEHA, sub: 'google-999', email: 'new.person@gmail.com' })
    expect(newcomer.callback.headers.location).toBe('/login?error=registration_closed')

    const returning = await signInWithGoogle(NEHA)
    expect(returning.callback.headers.location).toBe('/')
  })

  it('does NOT apply the allowed-email-domains rule (Google verified the email)', async () => {
    const { agent } = await signInWithGoogle({ ...NEHA, email: 'neha@college.edu' })
    const me = await agent.get('/api/auth/me')
    expect(me.body.user.email).toBe('neha@college.edu')
  })

  it('refuses a suspended account', async () => {
    await signInWithGoogle(NEHA)
    await User.updateOne({ googleId: NEHA.sub }, { suspended: true })
    const { callback } = await signInWithGoogle(NEHA)
    expect(callback.headers.location).toBe('/login?error=suspended')
  })
})
