import request from 'supertest'
import { describe, expect, it } from 'vitest'

import app from '../src/app.js'
import { User } from '../src/models/User.js'
import { registerUser } from './helpers.js'

const valid = {
  username: 'Aman_01',
  displayName: 'Aman',
  email: 'Aman@Example.com',
  password: 'password123',
}

describe('POST /api/auth/register', () => {
  it('creates the user, sets the cookie and returns my profile', async () => {
    const res = await request(app).post('/api/auth/register').send(valid)

    expect(res.status).toBe(201)
    // Username and email are normalised to lowercase.
    expect(res.body.user).toEqual({
      id: expect.any(String),
      username: 'aman_01',
      displayName: 'Aman',
      bio: '',
      avatarUrl: null,
      email: 'aman@example.com',
      usernameChangeAllowedAt: null,
    })

    const cookie = res.headers['set-cookie'][0]
    expect(cookie).toMatch(/^token=/)
    expect(cookie).toMatch(/HttpOnly/i)
    expect(cookie).toMatch(/SameSite=Lax/i)
  })

  it('never returns the password hash or the token in the body', async () => {
    const res = await request(app).post('/api/auth/register').send(valid)

    const body = JSON.stringify(res.body)
    expect(body).not.toMatch(/passwordHash/)
    expect(body).not.toMatch(/password123/)
    expect(res.body.token).toBeUndefined()
  })

  it('stores a bcrypt hash, not the password', async () => {
    await request(app).post('/api/auth/register').send(valid)

    const user = await User.findOne({ username: 'aman_01' }).select('+passwordHash')
    expect(user.passwordHash).toMatch(/^\$2[aby]\$12\$/) // bcrypt, cost 12
  })

  it('returns 409 for a taken username, whatever its case', async () => {
    await request(app).post('/api/auth/register').send(valid)
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...valid, username: 'AMAN_01', email: 'other@example.com' })

    expect(res.status).toBe(409)
    expect(res.body).toEqual({ message: 'Username already taken' })
  })

  it('returns 409 for a registered email', async () => {
    await request(app).post('/api/auth/register').send(valid)
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...valid, username: 'someone_else' })

    expect(res.status).toBe(409)
    expect(res.body).toEqual({ message: 'Email already registered' })
  })

  it.each([
    ['a username that is too short', { username: 'ab' }],
    ['a username with a space', { username: 'aman kumar' }],
    ['a username with a symbol', { username: 'aman!' }],
    ['an empty display name', { displayName: '   ' }],
    ['a display name over 40 characters', { displayName: 'x'.repeat(41) }],
    ['an invalid email', { email: 'not-an-email' }],
    ['a password under 8 characters', { password: 'short' }],
    ['a password over 72 characters', { password: 'x'.repeat(73) }],
  ])('returns 400 for %s', async (_label, change) => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...valid, ...change })

    expect(res.status).toBe(400)
    expect(typeof res.body.message).toBe('string')
  })

  it('rejects NoSQL operator injection', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...valid, username: { $gt: '' } })

    expect(res.status).toBe(400)
  })
})

describe('POST /api/auth/login', () => {
  it('logs in with the username', async () => {
    await registerUser('priya')
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'priya', password: 'password123' })

    expect(res.status).toBe(200)
    expect(res.body.user.username).toBe('priya')
    expect(res.headers['set-cookie'][0]).toMatch(/^token=/)
  })

  it('logs in with the email, in any case', async () => {
    await registerUser('priya')
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'PRIYA@example.com', password: 'password123' })

    expect(res.status).toBe(200)
  })

  it('gives the same 401 for a wrong password and for an unknown user', async () => {
    await registerUser('priya')
    const wrongPassword = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'priya', password: 'wrong-password' })
    const unknownUser = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'nobody', password: 'password123' })

    expect(wrongPassword.status).toBe(401)
    expect(unknownUser.status).toBe(401)
    expect(wrongPassword.body).toEqual({ message: 'Invalid credentials' })
    expect(unknownUser.body).toEqual(wrongPassword.body)
  })

  it('rejects NoSQL operator injection in the identifier', async () => {
    await registerUser('priya')
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: { $ne: null }, password: 'password123' })

    expect(res.status).toBe(400)
  })
})

describe('GET /api/auth/me', () => {
  it('returns my profile when logged in', async () => {
    const { agent } = await registerUser('rahul')
    const res = await agent.get('/api/auth/me')

    expect(res.status).toBe(200)
    expect(res.body.user).toMatchObject({ username: 'rahul', email: 'rahul@example.com' })
  })

  it('returns 401 with no cookie', async () => {
    const res = await request(app).get('/api/auth/me')

    expect(res.status).toBe(401)
    expect(res.body).toEqual({ message: 'Not authenticated' })
  })

  it('returns 401 for a forged token', async () => {
    const res = await request(app).get('/api/auth/me').set('Cookie', 'token=not.a.real.token')

    expect(res.status).toBe(401)
  })

  it('returns 401 once the user no longer exists', async () => {
    const { agent, user } = await registerUser('rahul')
    await User.deleteOne({ _id: user.id })

    const res = await agent.get('/api/auth/me')
    expect(res.status).toBe(401)
  })
})

describe('POST /api/auth/logout', () => {
  it('clears the cookie so the session ends', async () => {
    const { agent } = await registerUser('rahul')

    const res = await agent.post('/api/auth/logout')
    expect(res.status).toBe(204)
    expect(res.headers['set-cookie'][0]).toMatch(/^token=;/)

    const after = await agent.get('/api/auth/me')
    expect(after.status).toBe(401)
  })
})
