import http from 'node:http'

import mongoose from 'mongoose'
import { io as connectClient } from 'socket.io-client'
import request from 'supertest'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import app from '../src/app.js'
import { Update } from '../src/models/Update.js'
import { User } from '../src/models/User.js'
import { initSocket } from '../src/socket/index.js'
import { PDF, PNG, SVG, makeAdmin, registerUser } from './helpers.js'

// The "PingMe" updates channel: admins post, every logged-in user reads.

async function registerAdmin(name = 'admin') {
  const admin = await registerUser(name)
  await makeAdmin(admin.user.id)
  return admin
}

const post = (agent, text, image) => {
  const req = agent.post('/api/admin/updates')
  if (text !== undefined) req.field('text', text)
  if (image) req.attach('image', image.buffer, image.name)
  return req
}

const storedFileCount = () => mongoose.connection.db.collection('uploads.files').countDocuments()

describe('posting an update', () => {
  it('needs an admin account (and no file is received from anyone else)', async () => {
    expect((await request(app).post('/api/admin/updates').field('text', 'hi')).status).toBe(401)

    const { agent } = await registerUser('aman')
    const res = await post(agent, 'hi', { buffer: PNG, name: 'p.png' })
    expect(res.status).toBe(403)
    expect(await storedFileCount()).toBe(0)
  })

  it('posts text only', async () => {
    const { agent } = await registerAdmin()
    const res = await post(agent, '  New: voice notes 🎤  ')

    expect(res.status).toBe(201)
    expect(res.body.update).toEqual({
      id: expect.any(String),
      text: 'New: voice notes 🎤', // trimmed
      imageUrl: null,
      createdAt: expect.any(String),
    })
    // The author is never sent to clients.
    expect(res.body.update).not.toHaveProperty('author')
  })

  it('also accepts a plain JSON body for a text-only post', async () => {
    const { agent } = await registerAdmin()
    const res = await agent.post('/api/admin/updates').send({ text: 'Hello everyone' })
    expect(res.status).toBe(201)
    expect(res.body.update.text).toBe('Hello everyone')
  })

  it('posts a photo, with or without text', async () => {
    const { agent } = await registerAdmin()

    const withText = await post(agent, 'Dark mode is here', { buffer: PNG, name: 'shot.png' })
    expect(withText.status).toBe(201)
    expect(withText.body.update.imageUrl).toBe(`/api/updates/${withText.body.update.id}/image`)

    const photoOnly = await post(agent, undefined, { buffer: PNG, name: 'shot.png' })
    expect(photoOnly.status).toBe(201)
    expect(photoOnly.body.update.text).toBe('')
    expect(await storedFileCount()).toBe(2)
  })

  it('refuses an empty post', async () => {
    const { agent } = await registerAdmin()
    const res = await post(agent, '   ')
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ message: 'Write something or add a photo' })
  })

  it('refuses text over 1000 characters', async () => {
    const { agent } = await registerAdmin()
    const res = await post(agent, 'x'.repeat(1001))
    expect(res.status).toBe(400)
    expect(res.body.message).toBe('text: must be at most 1000 characters')
  })

  it('refuses a file that is not a photo - checked by its bytes, not its name', async () => {
    const { agent } = await registerAdmin()

    const svg = await post(agent, 'look', { buffer: SVG, name: 'logo.svg' })
    expect(svg.status).toBe(400)
    expect(svg.body.message).toBe('The photo must be a JPEG, PNG, WebP or GIF image')

    const pdfNamedPng = await post(agent, 'look', { buffer: PDF, name: 'photo.png' })
    expect(pdfNamedPng.status).toBe(400)

    expect(await Update.countDocuments()).toBe(0)
    expect(await storedFileCount()).toBe(0)
  })
})

describe('reading updates', () => {
  it('needs a session', async () => {
    expect((await request(app).get('/api/updates')).status).toBe(401)
    expect((await request(app).get('/api/updates/summary')).status).toBe(401)
  })

  it('pages through posts like chat history: oldest -> newest, with hasMore', async () => {
    const { agent: adminAgent } = await registerAdmin()
    for (let i = 1; i <= 25; i++) await post(adminAgent, `Update ${i}`)
    const { agent } = await registerUser('aman')

    const first = await agent.get('/api/updates')
    expect(first.status).toBe(200)
    expect(first.body.hasMore).toBe(true)
    expect(first.body.updates.map((u) => u.text)).toEqual(
      Array.from({ length: 20 }, (_, i) => `Update ${i + 6}`),
    )

    const older = await agent.get('/api/updates').query({ before: first.body.updates[0].id })
    expect(older.body.hasMore).toBe(false)
    expect(older.body.updates.map((u) => u.text)).toEqual(['Update 1', 'Update 2', 'Update 3', 'Update 4', 'Update 5'])
  })

  it('rejects a malformed cursor', async () => {
    const { agent } = await registerUser('aman')
    expect((await agent.get('/api/updates').query({ before: 'nope' })).status).toBe(400)
  })

  it('serves a post photo to any logged-in user, with its real type', async () => {
    const { agent: adminAgent } = await registerAdmin()
    const { body } = await post(adminAgent, 'pic', { buffer: PNG, name: 'p.png' })
    const { agent } = await registerUser('aman')

    const res = await agent.get(body.update.imageUrl)
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toBe('image/png')
    expect(res.headers['content-disposition']).toMatch(/^inline/)
    expect(res.headers['cache-control']).toBe('private, max-age=31536000, immutable')
    expect(Buffer.compare(res.body, PNG)).toBe(0)

    expect((await request(app).get(body.update.imageUrl)).status).toBe(401)
  })

  it('returns 404 for a post with no photo', async () => {
    const { agent } = await registerAdmin()
    const { body } = await post(agent, 'text only')
    expect((await agent.get(`/api/updates/${body.update.id}/image`)).status).toBe(404)
  })
})

describe('unread count and the read pointer', () => {
  it('counts every post as unread for a new user, and marking read clears it', async () => {
    const { agent: adminAgent } = await registerAdmin()
    await post(adminAgent, 'One')
    const latest = (await post(adminAgent, 'Two')).body.update
    const { agent } = await registerUser('aman')

    const before = await agent.get('/api/updates/summary')
    expect(before.body).toEqual({ latest, unreadCount: 2 })

    expect((await agent.post('/api/updates/read').send({ upToId: latest.id })).status).toBe(204)
    expect((await agent.get('/api/updates/summary')).body.unreadCount).toBe(0)

    // A new post is unread again.
    await post(adminAgent, 'Three')
    expect((await agent.get('/api/updates/summary')).body.unreadCount).toBe(1)
  })

  it('only ever moves forward - an older id is ignored', async () => {
    const { agent: adminAgent } = await registerAdmin()
    const first = (await post(adminAgent, 'One')).body.update
    const second = (await post(adminAgent, 'Two')).body.update
    const { agent, user } = await registerUser('aman')

    await agent.post('/api/updates/read').send({ upToId: second.id })
    await agent.post('/api/updates/read').send({ upToId: first.id })

    expect(String((await User.findById(user.id)).updatesReadUpTo)).toBe(second.id)
    expect((await agent.get('/api/updates/summary')).body.unreadCount).toBe(0)
  })

  it('has an empty summary when nothing was ever posted', async () => {
    const { agent } = await registerUser('aman')
    expect((await agent.get('/api/updates/summary')).body).toEqual({ latest: null, unreadCount: 0 })
  })

  it('refuses an id that is not a real post, or not an id at all', async () => {
    const { agent } = await registerUser('aman')
    const unknown = new mongoose.Types.ObjectId().toString()
    expect((await agent.post('/api/updates/read').send({ upToId: unknown })).status).toBe(404)
    expect((await agent.post('/api/updates/read').send({ upToId: { $gt: '' } })).status).toBe(400)
  })
})

describe('deleting an update', () => {
  it('removes the post and its photo for everyone', async () => {
    const { agent } = await registerAdmin()
    const older = (await post(agent, 'Keep me')).body.update
    const doomed = (await post(agent, 'Oops', { buffer: PNG, name: 'p.png' })).body.update

    expect((await agent.delete(`/api/admin/updates/${doomed.id}`)).status).toBe(204)
    expect(await Update.exists({ _id: doomed.id })).toBeNull()
    expect(await storedFileCount()).toBe(0)
    expect((await agent.get(doomed.imageUrl)).status).toBe(404)
    // The summary now points at the post before it.
    expect((await agent.get('/api/updates/summary')).body.latest).toEqual(older)

    expect((await agent.delete(`/api/admin/updates/${doomed.id}`)).status).toBe(404)
  })

  it('needs an admin account', async () => {
    const { agent: adminAgent } = await registerAdmin()
    const { body } = await post(adminAgent, 'Hi')
    const { agent } = await registerUser('aman')
    expect((await agent.delete(`/api/admin/updates/${body.update.id}`)).status).toBe(403)
    expect(await Update.exists({ _id: body.update.id })).not.toBeNull()
  })
})

// --- Live events --------------------------------------------------------------

describe('live events', () => {
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
      extraHeaders: { cookie },
      reconnection: false,
      forceNew: true,
    })
    clients.push(socket)
    return new Promise((resolve, reject) => {
      socket.on('connect', () => resolve(socket))
      socket.on('connect_error', reject)
    })
  }

  function waitFor(socket, event, ms = 2000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), ms)
      socket.once(event, (payload) => {
        clearTimeout(timer)
        resolve(payload)
      })
    })
  }

  function staysSilent(socket, event, ms = 300) {
    return new Promise((resolve) => {
      const onEvent = () => resolve(false)
      socket.once(event, onEvent)
      setTimeout(() => {
        socket.off(event, onEvent)
        resolve(true)
      }, ms)
    })
  }

  it('sends a new post and a deletion to everyone connected', async () => {
    const { agent } = await registerAdmin()
    const aman = await registerUser('aman')
    const priya = await registerUser('priya')
    const amanSocket = await connect(aman.cookie)
    const priyaSocket = await connect(priya.cookie)

    const arrivals = [waitFor(amanSocket, 'update:new'), waitFor(priyaSocket, 'update:new')]
    const { body } = await post(agent, 'PingMe AI is coming soon ✨')
    for (const payload of await Promise.all(arrivals)) expect(payload).toEqual({ update: body.update })

    const deletions = [waitFor(amanSocket, 'update:deleted'), waitFor(priyaSocket, 'update:deleted')]
    await agent.delete(`/api/admin/updates/${body.update.id}`)
    for (const payload of await Promise.all(deletions)) expect(payload).toEqual({ id: body.update.id })
  })

  it('tells only MY other tabs that I read the channel', async () => {
    const { agent: adminAgent } = await registerAdmin()
    const { body } = await post(adminAgent, 'Hello')
    const aman = await registerUser('aman')
    const priya = await registerUser('priya')
    const amanOtherTab = await connect(aman.cookie)
    const priyaSocket = await connect(priya.cookie)

    const silentForPriya = staysSilent(priyaSocket, 'updates:read')
    const toMyOtherTab = waitFor(amanOtherTab, 'updates:read')
    await aman.agent.post('/api/updates/read').send({ upToId: body.update.id })

    expect(await toMyOtherTab).toEqual({ upToId: body.update.id })
    expect(await silentForPriya).toBe(true)

    // Reading the same post again moves nothing, so nothing is announced.
    const silentRepeat = staysSilent(amanOtherTab, 'updates:read')
    await aman.agent.post('/api/updates/read').send({ upToId: body.update.id })
    expect(await silentRepeat).toBe(true)
  })
})
