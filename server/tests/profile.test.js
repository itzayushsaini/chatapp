import mongoose from 'mongoose'
import request from 'supertest'
import { describe, expect, it } from 'vitest'

import app from '../src/app.js'
import { User } from '../src/models/User.js'
import { HTML, PDF, PNG, registerUser, sized } from './helpers.js'

const DAY = 24 * 60 * 60 * 1000

const uploadedFileCount = () => mongoose.connection.db.collection('uploads.files').countDocuments()

describe('PATCH /api/users/me - name and bio', () => {
  it('updates display name and bio and returns my full profile', async () => {
    const { agent } = await registerUser('aman')

    const res = await agent
      .patch('/api/users/me')
      .send({ displayName: '  Aman Verma ', bio: 'Final-year CSE student' })

    expect(res.status).toBe(200)
    expect(res.body.user).toMatchObject({
      username: 'aman',
      displayName: 'Aman Verma',
      bio: 'Final-year CSE student',
      email: 'aman@example.com',
    })
    expect((await agent.get('/api/auth/me')).body.user.bio).toBe('Final-year CSE student')
  })

  it('can clear the bio', async () => {
    const { agent } = await registerUser('aman')
    await agent.patch('/api/users/me').send({ bio: 'hello' })

    const res = await agent.patch('/api/users/me').send({ bio: '' })
    expect(res.body.user.bio).toBe('')
  })

  it.each([
    ['a bio over 160 characters', { bio: 'x'.repeat(161) }],
    ['an empty display name', { displayName: '  ' }],
    ['a display name over 40 characters', { displayName: 'x'.repeat(41) }],
    ['an invalid username', { username: 'no spaces!' }],
    ['an operator object', { bio: { $gt: '' } }],
  ])('returns 400 for %s', async (_label, body) => {
    const { agent } = await registerUser('aman')
    const res = await agent.patch('/api/users/me').send(body)
    expect(res.status).toBe(400)
  })

  it('ignores fields that cannot be changed here (email, password)', async () => {
    const { agent } = await registerUser('aman')

    const res = await agent
      .patch('/api/users/me')
      .send({ email: 'stolen@example.com', passwordHash: 'x', bio: 'hi' })

    expect(res.status).toBe(200)
    expect(res.body.user.email).toBe('aman@example.com')
  })

  it('requires login', async () => {
    const res = await request(app).patch('/api/users/me').send({ bio: 'x' })
    expect(res.status).toBe(401)
  })
})

describe('PATCH /api/users/me - username', () => {
  it('changes the username: log in and be found by the new one only', async () => {
    const { agent } = await registerUser('aman')
    const { agent: other } = await registerUser('priya')

    const res = await agent.patch('/api/users/me').send({ username: 'Aman_V' })

    expect(res.status).toBe(200)
    expect(res.body.user.username).toBe('aman_v')
    const allowedAt = new Date(res.body.user.usernameChangeAllowedAt)
    expect(allowedAt - Date.now()).toBeGreaterThan(29 * DAY)

    const login = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'aman_v', password: 'password123' })
    expect(login.status).toBe(200)

    expect((await other.get('/api/users/search?username=aman')).status).toBe(404)
    expect((await other.get('/api/users/search?username=aman_v')).status).toBe(200)
  })

  it('returns 409 for a username someone else has, whatever its case', async () => {
    const { agent } = await registerUser('aman')
    await registerUser('priya')

    const res = await agent.patch('/api/users/me').send({ username: 'PRIYA' })

    expect(res.status).toBe(409)
    expect(res.body).toEqual({ message: 'Username already taken' })
  })

  it('allows only one change every 30 days', async () => {
    const { agent, user } = await registerUser('aman')
    await agent.patch('/api/users/me').send({ username: 'aman_one' })

    const tooSoon = await agent.patch('/api/users/me').send({ username: 'aman_two' })
    expect(tooSoon.status).toBe(429)
    expect(tooSoon.body.message).toMatch(/You can change your username again on \d{4}-\d{2}-\d{2}/)

    // Pretend the first change was 31 days ago.
    await User.updateOne({ _id: user.id }, { usernameChangedAt: new Date(Date.now() - 31 * DAY) })
    const later = await agent.patch('/api/users/me').send({ username: 'aman_two' })
    expect(later.status).toBe(200)
  })

  it('sending my current username is not a change and does not start the cooldown', async () => {
    const { agent } = await registerUser('aman')

    const same = await agent.patch('/api/users/me').send({ username: 'AMAN', bio: 'hi' })
    expect(same.status).toBe(200)
    expect(same.body.user.usernameChangeAllowedAt).toBeNull()

    const real = await agent.patch('/api/users/me').send({ username: 'aman_new' })
    expect(real.status).toBe(200)
  })

  it('two changes sent at the same moment: exactly one wins', async () => {
    const { agent } = await registerUser('aman')

    const results = await Promise.all([
      agent.patch('/api/users/me').send({ username: 'first_name' }),
      agent.patch('/api/users/me').send({ username: 'second_name' }),
    ])

    expect(results.map((r) => r.status).sort()).toEqual([200, 429])
  })
})

describe('profile picture', () => {
  it('uploads a picture, which anyone logged in can then load', async () => {
    const { agent, user } = await registerUser('aman')
    const { agent: stranger } = await registerUser('rahul')

    const res = await agent.put('/api/users/me/avatar').attach('avatar', PNG, 'me.png')

    expect(res.status).toBe(200)
    expect(res.body.user.avatarUrl).toMatch(new RegExp(`^/api/users/${user.id}/avatar\\?v=[a-f0-9]{24}$`))

    const image = await stranger.get(res.body.user.avatarUrl).buffer(true)
    expect(image.status).toBe(200)
    expect(image.headers['content-type']).toBe('image/png')
    expect(image.headers['cache-control']).toMatch(/immutable/)
    expect(Buffer.compare(image.body, PNG)).toBe(0)
  })

  it('is shown in search results, with the bio, to people who are not friends', async () => {
    const { agent } = await registerUser('aman')
    const { agent: stranger } = await registerUser('rahul')
    await agent.put('/api/users/me/avatar').attach('avatar', PNG, 'me.png')
    await agent.patch('/api/users/me').send({ bio: 'Say hi!' })

    const res = await stranger.get('/api/users/search?username=aman')

    expect(res.body.user).toMatchObject({ bio: 'Say hi!', avatarUrl: expect.any(String) })
    expect(res.body.user.email).toBeUndefined()
  })

  it('replacing the picture deletes the old file', async () => {
    const { agent } = await registerUser('aman')
    const first = await agent.put('/api/users/me/avatar').attach('avatar', PNG, 'a.png')
    const second = await agent.put('/api/users/me/avatar').attach('avatar', PNG, 'b.png')

    expect(second.body.user.avatarUrl).not.toBe(first.body.user.avatarUrl)
    expect(await uploadedFileCount()).toBe(1)
  })

  it('removing it goes back to initials and deletes the file', async () => {
    const { agent, user } = await registerUser('aman')
    await agent.put('/api/users/me/avatar').attach('avatar', PNG, 'a.png')

    const res = await agent.delete('/api/users/me/avatar')

    expect(res.status).toBe(200)
    expect(res.body.user.avatarUrl).toBeNull()
    expect((await agent.get(`/api/users/${user.id}/avatar`)).status).toBe(404)
    expect(await uploadedFileCount()).toBe(0)
  })

  it.each([
    ['an HTML file named .png', HTML, 'me.png'],
    ['a PDF', PDF, 'me.pdf'],
  ])('refuses %s', async (_label, bytes, name) => {
    const { agent } = await registerUser('aman')
    const res = await agent.put('/api/users/me/avatar').attach('avatar', bytes, name)

    expect(res.status).toBe(400)
    expect(await uploadedFileCount()).toBe(0)
  })

  it('refuses a picture over 2 MB with 413', async () => {
    const { agent } = await registerUser('aman')
    const big = sized(PNG.subarray(0, 8), 2 * 1024 * 1024 + 1)

    const res = await agent.put('/api/users/me/avatar').attach('avatar', big, 'big.png')

    expect(res.status).toBe(413)
    expect(res.body).toEqual({ message: 'File is too large' })
  })

  it('returns 400 when no file is attached', async () => {
    const { agent } = await registerUser('aman')
    const res = await agent.put('/api/users/me/avatar')
    expect(res.status).toBe(400)
  })

  it('loading a picture requires login', async () => {
    const { agent, user } = await registerUser('aman')
    await agent.put('/api/users/me/avatar').attach('avatar', PNG, 'a.png')

    const res = await request(app).get(`/api/users/${user.id}/avatar`)
    expect(res.status).toBe(401)
  })
})
