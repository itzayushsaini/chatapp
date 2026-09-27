import http from 'node:http'

import { io as connectClient } from 'socket.io-client'
import request from 'supertest'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import app from '../src/app.js'
import { Conversation } from '../src/models/Conversation.js'
import { Friendship } from '../src/models/Friendship.js'
import { initSocket } from '../src/socket/index.js'
import { makeAdmin, makeFriends, registerUser } from './helpers.js'

describe('GET /api/settings/public', () => {
  it('is reachable with no session at all', async () => {
    const res = await request(app).get('/api/settings/public')

    expect(res.status).toBe(200)
    expect(res.body.settings).toEqual({
      registrationOpen: true,
      allowedEmailDomains: ['gmail.com'],
      announcement: { enabled: false, text: '' },
      // No Google credentials in the test environment.
      googleSignIn: false,
    })
  })
})

describe('admin routes require an admin account', () => {
  it('returns 401 with no session', async () => {
    const res = await request(app).get('/api/admin/stats')
    expect(res.status).toBe(401)
  })

  it('returns 403 for a logged-in user who is not an admin', async () => {
    const { agent } = await registerUser('aman')
    const res = await agent.get('/api/admin/stats')

    expect(res.status).toBe(403)
    expect(res.body).toEqual({ message: 'Admins only' })
  })
})

describe('settings', () => {
  it('reads and updates settings, live-updating public settings', async () => {
    const { agent, user } = await registerUser('aman')
    await makeAdmin(user.id)

    const before = await agent.get('/api/admin/settings')
    expect(before.body.settings).toMatchObject({
      allowedEmailDomains: ['gmail.com'],
      attachmentsEnabled: true,
      forwardingEnabled: true,
      deleteForEveryoneWindowMinutes: 60,
    })

    const updated = await agent.patch('/api/admin/settings').send({
      allowedEmailDomains: ['gmail.com', 'college.edu'],
      registrationOpen: false,
      announcement: { enabled: true, text: 'Under maintenance' },
    })
    expect(updated.status).toBe(200)
    expect(updated.body.settings.allowedEmailDomains).toEqual(['gmail.com', 'college.edu'])
    expect(updated.body.settings.registrationOpen).toBe(false)
    expect(updated.body.settings.announcement).toEqual({ enabled: true, text: 'Under maintenance' })

    const publicSettings = await request(app).get('/api/settings/public')
    expect(publicSettings.body.settings).toEqual({
      registrationOpen: false,
      allowedEmailDomains: ['gmail.com', 'college.edu'],
      announcement: { enabled: true, text: 'Under maintenance' },
      googleSignIn: false,
    })
  })

  it('rejects an invalid domain and an over-long announcement', async () => {
    const { agent, user } = await registerUser('aman')
    await makeAdmin(user.id)

    const badDomain = await agent.patch('/api/admin/settings').send({ allowedEmailDomains: ['not a domain'] })
    expect(badDomain.status).toBe(400)

    const longText = await agent
      .patch('/api/admin/settings')
      .send({ announcement: { text: 'x'.repeat(201) } })
    expect(longText.status).toBe(400)
  })

  it('blocks registration once closed', async () => {
    const { agent, user } = await registerUser('aman')
    await makeAdmin(user.id)
    await agent.patch('/api/admin/settings').send({ registrationOpen: false })

    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'priya', displayName: 'Priya', email: 'priya@gmail.com', password: 'password123' })

    expect(res.status).toBe(403)
    expect(res.body).toEqual({ message: 'Registration is currently closed' })
  })

  it('rejects an email outside the allowed domains, and accepts one added later', async () => {
    const rejected = await request(app)
      .post('/api/auth/register')
      .send({ username: 'priya', displayName: 'Priya', email: 'priya@yahoo.com', password: 'password123' })
    expect(rejected.status).toBe(400)
    expect(rejected.body.message).toContain('gmail.com')

    const { agent, user } = await registerUser('aman')
    await makeAdmin(user.id)
    await agent.patch('/api/admin/settings').send({ allowedEmailDomains: ['gmail.com', 'yahoo.com'] })

    const accepted = await request(app)
      .post('/api/auth/register')
      .send({ username: 'priya', displayName: 'Priya', email: 'priya@yahoo.com', password: 'password123' })
    expect(accepted.status).toBe(201)
  })
})

describe('user management', () => {
  it('lists and searches users', async () => {
    const { agent, user } = await registerUser('aman')
    await makeAdmin(user.id)
    await registerUser('priya')
    await registerUser('rahul')

    const all = await agent.get('/api/admin/users')
    expect(all.body.total).toBe(3)

    const searched = await agent.get('/api/admin/users').query({ search: 'riy' })
    expect(searched.body.users).toHaveLength(1)
    expect(searched.body.users[0].username).toBe('priya')
    expect(searched.body.users[0]).not.toHaveProperty('passwordHash')
  })

  it('cannot suspend or delete my own account', async () => {
    const { agent, user } = await registerUser('aman')
    await makeAdmin(user.id)

    const suspend = await agent.patch(`/api/admin/users/${user.id}/suspend`)
    expect(suspend.status).toBe(400)

    const del = await agent.delete(`/api/admin/users/${user.id}`)
    expect(del.status).toBe(400)
  })

  it('suspend blocks login, and unsuspend restores it', async () => {
    const { agent, user } = await registerUser('aman')
    await makeAdmin(user.id)
    const { user: priya } = await registerUser('priya')

    const suspend = await agent.patch(`/api/admin/users/${priya.id}/suspend`)
    expect(suspend.status).toBe(200)
    expect(suspend.body.user.suspended).toBe(true)

    const blockedLogin = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'priya', password: 'password123' })
    expect(blockedLogin.status).toBe(403)
    expect(blockedLogin.body).toEqual({ message: 'Your account has been suspended' })

    const unsuspend = await agent.patch(`/api/admin/users/${priya.id}/unsuspend`)
    expect(unsuspend.body.user.suspended).toBe(false)

    const restoredLogin = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'priya', password: 'password123' })
    expect(restoredLogin.status).toBe(200)
  })

  it('suspending a user immediately ends their existing REST session too', async () => {
    const { agent, user } = await registerUser('aman')
    await makeAdmin(user.id)
    const { agent: priyaAgent, user: priya } = await registerUser('priya')

    const before = await priyaAgent.get('/api/auth/me')
    expect(before.status).toBe(200)

    await agent.patch(`/api/admin/users/${priya.id}/suspend`)

    const after = await priyaAgent.get('/api/auth/me')
    expect(after.status).toBe(401)
  })

  it('deleting a user removes the friendship but keeps the conversation, like an unfriend', async () => {
    const { agent: aAgent, user: aman } = await registerUser('aman')
    await makeAdmin(aman.id)
    const { b: priya2, conversationId } = await makeFriends('aman2', 'priya2')

    const del = await aAgent.delete(`/api/admin/users/${priya2.user.id}`)
    expect(del.status).toBe(204)

    expect(
      await Friendship.exists({ $or: [{ requester: priya2.user.id }, { recipient: priya2.user.id }] }),
    ).toBeNull()
    expect(await Conversation.exists({ _id: conversationId })).toBeTruthy()
  })
})

describe('stats', () => {
  it('counts users and messages', async () => {
    const { agent, user } = await registerUser('aman')
    await makeAdmin(user.id)
    await registerUser('priya')

    const res = await agent.get('/api/admin/stats')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ totalUsers: 2, totalMessages: 0, onlineNow: 0 })
  })
})

describe('suspending an online user disconnects them immediately', () => {
  let httpServer
  let io
  let url
  const clients = []

  beforeAll(async () => {
    httpServer = http.createServer(app)
    io = initSocket(httpServer)
    await new Promise((resolve) => httpServer.listen(0, resolve))
    url = `http://localhost:${httpServer.address().port}`
  })

  afterEach(() => {
    while (clients.length) clients.pop().disconnect()
  })

  afterAll(async () => {
    await io.close()
  })

  function connect(cookie) {
    const socket = connectClient(url, {
      transports: ['websocket'],
      extraHeaders: cookie ? { cookie } : {},
      reconnection: false,
      forceNew: true,
    })
    clients.push(socket)
    return new Promise((resolve, reject) => {
      socket.on('connect', () => resolve(socket))
      socket.on('connect_error', reject)
    })
  }

  it('force-disconnects the suspended user\'s open socket', async () => {
    const { agent, user } = await registerUser('aman')
    await makeAdmin(user.id)
    const { cookie: priyaCookie, user: priya } = await registerUser('priya')

    const priyaSocket = await connect(priyaCookie)
    const disconnected = new Promise((resolve) => priyaSocket.once('disconnect', resolve))

    await agent.patch(`/api/admin/users/${priya.id}/suspend`)

    await disconnected
    expect(priyaSocket.connected).toBe(false)
  })
})
