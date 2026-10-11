import http from 'node:http'

import { io as connectClient } from 'socket.io-client'
import request from 'supertest'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import app from '../src/app.js'
import { Conversation } from '../src/models/Conversation.js'
import { AiMessage } from '../src/models/AiMessage.js'
import { Friendship } from '../src/models/Friendship.js'
import { Message } from '../src/models/Message.js'
import { User } from '../src/models/User.js'
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

  it('sorts users by newest, oldest, name or last seen, and refuses any other sort', async () => {
    const { agent, user } = await registerUser('aman', { displayName: 'aman verma' })
    await makeAdmin(user.id)
    const zoya = await registerUser('zoya', { displayName: 'Zoya Khan' })
    const bina = await registerUser('bina', { displayName: 'Bina Roy' })
    // Make the order unmistakable: aman oldest, then zoya, then bina - and
    // only zoya has ever been seen online.
    await User.updateOne({ _id: user.id }, { createdAt: new Date('2026-01-01') })
    await User.updateOne({ _id: zoya.user.id }, { createdAt: new Date('2026-02-01'), lastSeen: new Date('2026-09-01') })
    await User.updateOne({ _id: bina.user.id }, { createdAt: new Date('2026-03-01') })

    const names = async (sort) =>
      (await agent.get('/api/admin/users').query({ sort })).body.users.map((u) => u.username)

    expect(await names('newest')).toEqual(['bina', 'zoya', 'aman'])
    expect(await names('oldest')).toEqual(['aman', 'zoya', 'bina'])
    // Case does not matter: "aman verma" comes before "Bina Roy" and "Zoya Khan".
    expect(await names('name')).toEqual(['aman', 'bina', 'zoya'])
    expect((await names('lastSeen'))[0]).toBe('zoya')
    // Newest first when no sort is given.
    expect((await agent.get('/api/admin/users')).body.users[0].username).toBe('bina')

    // An unknown sort (or a list of them) is a validation error, never
    // passed to the database.
    expect((await agent.get('/api/admin/users').query({ sort: 'passwordHash' })).status).toBe(400)
    expect((await agent.get('/api/admin/users?sort=name&sort=oldest')).status).toBe(400)
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
    expect(res.body).toEqual({ totalUsers: 2, totalMessages: 0, aiAnswersToday: 0, onlineNow: 0 })
  })
})

describe('activity (the charts on the admin Overview)', () => {
  it('needs an administrator', async () => {
    expect((await request(app).get('/api/admin/stats/activity')).status).toBe(401)
    const { agent } = await registerUser('aman')
    expect((await agent.get('/api/admin/stats/activity')).status).toBe(403)
  })

  it('returns one entry per day, oldest first, with zeros for quiet days', async () => {
    const { agent, user } = await registerUser('aman')
    await makeAdmin(user.id)

    const res = await agent.get('/api/admin/stats/activity')
    expect(res.status).toBe(200)
    expect(res.body.days).toHaveLength(14)
    const dates = res.body.days.map((d) => d.date)
    expect(dates).toEqual([...dates].sort())
    expect(dates.at(-1)).toBe(new Date().toISOString().slice(0, 10))
    // Only the admin's own account exists, created today.
    const today = res.body.days.at(-1)
    expect(today).toEqual({ date: dates.at(-1), users: 1, messages: 0, aiAnswers: 0 })
    expect(res.body.days.slice(0, -1).every((d) => d.users === 0 && d.messages === 0)).toBe(true)
  })

  it('counts new accounts, messages and finished AI answers on the right day', async () => {
    const { a, conversationId } = await makeFriends('aman', 'priya')
    await makeAdmin(a.user.id)
    const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000)

    const make = (createdAt) =>
      Message.create({ conversation: conversationId, sender: a.user.id, text: 'hi', clientId: crypto.randomUUID(), createdAt })
    await make(daysAgo(0))
    await make(daysAgo(0))
    await make(daysAgo(2))
    await make(daysAgo(40)) // older than the window: not counted
    const ai = (extra) => AiMessage.create({ user: a.user.id, text: 'x', ...extra })
    await ai({ role: 'model', status: 'done', createdAt: daysAgo(1) })
    await ai({ role: 'model', status: 'error', createdAt: daysAgo(1) }) // failed answers do not count
    await ai({ role: 'user', createdAt: daysAgo(1) }) // a question is not an answer

    const res = await a.agent.get('/api/admin/stats/activity').query({ days: 7 })
    expect(res.body.days).toHaveLength(7)
    const byAge = (n) => res.body.days.at(-1 - n)
    expect(byAge(0).messages).toBe(2)
    expect(byAge(1).messages).toBe(0)
    expect(byAge(2).messages).toBe(1)
    expect(byAge(1).aiAnswers).toBe(1)
    expect(res.body.days.reduce((sum, d) => sum + d.messages, 0)).toBe(3)
    expect(res.body.days.reduce((sum, d) => sum + d.users, 0)).toBe(2)
  })

  it('accepts 7 to 90 days and refuses anything else', async () => {
    const { agent, user } = await registerUser('aman')
    await makeAdmin(user.id)
    expect((await agent.get('/api/admin/stats/activity').query({ days: 90 })).body.days).toHaveLength(90)
    for (const days of [0, 6, 91, 'abc']) {
      expect((await agent.get('/api/admin/stats/activity').query({ days })).status).toBe(400)
    }
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
