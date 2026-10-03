import http from 'node:http'

import request from 'supertest'
import { io as connectClient } from 'socket.io-client'
import webpush from 'web-push'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import app from '../src/app.js'
import { env } from '../src/config/env.js'
import { Conversation } from '../src/models/Conversation.js'
import { PushSubscription } from '../src/models/PushSubscription.js'
import { addConnection, removeConnection } from '../src/services/presenceService.js'
import { notifyAiAnswer } from '../src/services/pushService.js'
import { initSocket } from '../src/socket/index.js'
import { PNG, makeAdmin, makeFriends, registerUser, upload } from './helpers.js'

// Web Push, with web-push's real encryption and key code but a FAKE
// sendNotification - so nothing is ever posted to a real push service, and
// the tests can see exactly what would have been sent, and to whom.
vi.mock('web-push', async (importOriginal) => {
  const real = await importOriginal()
  const lib = real.default ?? real
  return { default: { ...lib, sendNotification: vi.fn() } }
})

const send = vi.mocked(webpush.sendNotification)
const keys = webpush.generateVAPIDKeys()

// A subscription as a browser would make it: an FCM address and the
// device's (base64url) keys.
const subscription = (n = 1) => ({
  endpoint: `https://fcm.googleapis.com/fcm/send/device-${n}`,
  keys: {
    p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
    auth: 'tBHItJI5svbpez7KI4CCXg',
  },
})

const subscribe = (agent, n = 1) => agent.post('/api/push/subscriptions').send(subscription(n))

// What was pushed: [{ endpoint, payload }] in order.
const pushed = () => send.mock.calls.map(([sub, body]) => ({ endpoint: sub.endpoint, payload: JSON.parse(body) }))

// Pushes are sent in the background, after the response.
const settle = () => new Promise((resolve) => setTimeout(resolve, 150))

beforeEach(() => {
  env.VAPID_PUBLIC_KEY = keys.publicKey
  env.VAPID_PRIVATE_KEY = keys.privateKey
  send.mockReset().mockResolvedValue({ statusCode: 201 })
})

afterEach(() => {
  delete env.VAPID_PUBLIC_KEY
  delete env.VAPID_PRIVATE_KEY
})

describe('push: the key and subscriptions', () => {
  it('needs a login', async () => {
    expect((await request(app).get('/api/push/key')).status).toBe(401)
    expect((await request(app).post('/api/push/subscriptions').send(subscription())).status).toBe(401)
  })

  it('hands out the public key - or null when push is not set up', async () => {
    const { agent } = await registerUser('riya')
    expect((await agent.get('/api/push/key')).body).toEqual({ publicKey: keys.publicKey })
    delete env.VAPID_PRIVATE_KEY
    expect((await agent.get('/api/push/key')).body).toEqual({ publicKey: null })
  })

  it('saves a subscription (twice is fine), and only for a real push service', async () => {
    const { agent, user } = await registerUser('riya')
    expect((await subscribe(agent)).status).toBe(204)
    expect((await subscribe(agent)).status).toBe(204)
    expect(await PushSubscription.countDocuments({ user: user.id })).toBe(1)

    for (const endpoint of [
      'http://fcm.googleapis.com/fcm/send/x', // not https
      'https://evil.example.com/collect', // not a push service
      'https://fcm.googleapis.com.evil.example.com/x', // look-alike host
      'https://169.254.169.254/latest/meta-data', // an internal address
    ]) {
      const res = await agent.post('/api/push/subscriptions').send({ ...subscription(), endpoint })
      expect(res.status).toBe(400)
    }
    const badKeys = await agent
      .post('/api/push/subscriptions')
      .send({ ...subscription(2), keys: { p256dh: 'not base64!', auth: { $gt: '' } } })
    expect(badKeys.status).toBe(400)
  })

  it('accepts every major browser push service', async () => {
    const { agent } = await registerUser('riya')
    for (const endpoint of [
      'https://updates.push.services.mozilla.com/wpush/v2/abc',
      'https://web.push.apple.com/QGuQyavXutnMH',
      'https://wns2-par02p.notify.windows.com/w/?token=abc',
    ]) {
      expect((await agent.post('/api/push/subscriptions').send({ ...subscription(), endpoint })).status).toBe(204)
    }
  })

  it('a device used by someone else moves to them; nobody can remove someone else’s', async () => {
    const riya = await registerUser('riya')
    const aman = await registerUser('aman')
    await subscribe(riya.agent)
    await subscribe(aman.agent) // the same browser, now logged in as Aman
    expect((await PushSubscription.findOne()).user.toString()).toBe(aman.user.id)

    await riya.agent.delete('/api/push/subscriptions').send({ endpoint: subscription().endpoint })
    expect(await PushSubscription.countDocuments()).toBe(1)
    expect((await aman.agent.delete('/api/push/subscriptions').send({ endpoint: subscription().endpoint })).status).toBe(204)
    expect(await PushSubscription.countDocuments()).toBe(0)
  })
})

describe('push: friend requests', () => {
  it('a request reaches someone with PingMe closed; accepting tells the sender', async () => {
    const riya = await registerUser('riya', { displayName: 'Riya Sharma' })
    const aman = await registerUser('aman', { displayName: 'Aman' })
    await subscribe(riya.agent, 1)
    await subscribe(aman.agent, 2)

    const sent = await riya.agent.post('/api/friends/requests').send({ username: 'aman' })
    await settle()
    expect(pushed()).toEqual([
      {
        endpoint: subscription(2).endpoint,
        payload: {
          title: 'New friend request',
          body: 'Riya Sharma (@riya) wants to chat with you',
          tag: 'friend-requests',
          open: 'requests',
        },
      },
    ])

    send.mockClear()
    const accepted = await aman.agent.post(`/api/friends/requests/${sent.body.request.id}/accept`)
    await settle()
    expect(pushed()).toEqual([
      {
        endpoint: subscription(1).endpoint,
        payload: {
          title: 'Aman accepted your friend request',
          body: 'You can chat now - say hi 👋',
          tag: `chat-${accepted.body.friend.conversationId}`,
          open: accepted.body.friend.conversationId,
        },
      },
    ])
  })

  it('nothing is pushed while they have PingMe open, or when push is not set up', async () => {
    const riya = await registerUser('riya')
    const aman = await registerUser('aman')
    await subscribe(aman.agent)

    addConnection(aman.user.id) // Aman has PingMe open - the app shows its own notification
    await riya.agent.post('/api/friends/requests').send({ username: 'aman' })
    await settle()
    removeConnection(aman.user.id)
    expect(send).not.toHaveBeenCalled()

    delete env.VAPID_PUBLIC_KEY
    const kabir = await registerUser('kabir')
    await kabir.agent.post('/api/friends/requests').send({ username: 'aman' })
    await settle()
    expect(send).not.toHaveBeenCalled()
  })
})

describe('push: messages', () => {
  let httpServer
  let io
  let url

  beforeAll(async () => {
    httpServer = http.createServer(app)
    io = initSocket(httpServer)
    await new Promise((resolve) => httpServer.listen(0, resolve))
    url = `http://localhost:${httpServer.address().port}`
  })

  afterAll(async () => {
    await io.close()
  })

  function connect(cookie) {
    const socket = connectClient(url, { transports: ['websocket'], extraHeaders: { cookie }, reconnection: false, forceNew: true })
    return new Promise((resolve, reject) => {
      socket.on('connect', () => resolve(socket))
      socket.on('connect_error', reject)
    })
  }

  const sendMessage = (socket, conversationId, fields) =>
    socket.emitWithAck('message:send', { conversationId, clientId: crypto.randomUUID(), ...fields })

  it('a message to a friend with PingMe closed: their name, the text, and which chat to open', async () => {
    const { a, b, conversationId } = await makeFriends('riya', 'aman')
    await subscribe(b.agent)
    const socket = await connect(a.cookie)

    expect((await sendMessage(socket, conversationId, { text: '  Are you coming to the lab?  ' })).ok).toBe(true)
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1))
    expect(pushed()[0].payload).toEqual({
      title: 'riya',
      body: 'Are you coming to the lab?',
      tag: `chat-${conversationId}`,
      open: conversationId,
    })
    socket.disconnect()
  })

  it('a photo shows as "📷 Photo"; a long text is shortened', async () => {
    const { a, b, conversationId } = await makeFriends('riya', 'aman')
    await subscribe(b.agent)
    const socket = await connect(a.cookie)

    const photo = await upload(a.agent, conversationId, PNG, 'trip.png')
    await sendMessage(socket, conversationId, { attachmentId: photo.body.attachment.id })
    await sendMessage(socket, conversationId, { text: 'x'.repeat(500) })
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2))
    const bodies = pushed().map((p) => p.payload.body).sort()
    expect(bodies).toContainEqual('📷 Photo')
    expect(bodies.find((b) => b.startsWith('x'))).toHaveLength(120)
    socket.disconnect()
  })

  it('never for a chat they muted, nor while they are online', async () => {
    const { a, b, conversationId } = await makeFriends('riya', 'aman')
    await subscribe(b.agent)
    const socket = await connect(a.cookie)

    await Conversation.updateOne({ _id: conversationId }, { $addToSet: { mutedBy: b.user.id } })
    await sendMessage(socket, conversationId, { text: 'muted' })
    await settle() // let the background push check finish while it is still muted
    await Conversation.updateOne({ _id: conversationId }, { $pull: { mutedBy: b.user.id } })

    const bSocket = await connect(b.cookie) // Aman opens PingMe
    await sendMessage(socket, conversationId, { text: 'online' })
    await settle()
    expect(send).not.toHaveBeenCalled()
    socket.disconnect()
    bSocket.disconnect()
  })
})

describe('push: delivery problems', () => {
  it('a subscription the browser threw away (410) is deleted; other failures keep it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const riya = await registerUser('riya')
    const aman = await registerUser('aman')
    await subscribe(aman.agent, 1)
    await subscribe(aman.agent, 2)

    send.mockImplementation(async (sub) => {
      if (sub.endpoint.endsWith('device-1')) throw Object.assign(new Error('Gone'), { statusCode: 410 })
      throw Object.assign(new Error('Server error'), { statusCode: 500 })
    })
    await riya.agent.post('/api/friends/requests').send({ username: 'aman' })
    await settle()

    const left = await PushSubscription.find()
    expect(left.map((s) => s.endpoint)).toEqual([subscription(2).endpoint])
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('fcm.googleapis.com failed (500)'))
    warn.mockRestore()
  })
})

describe('push: updates channel and PingMe AI', () => {
  it('a new update post reaches everyone with PingMe closed', async () => {
    const admin = await registerUser('boss')
    await makeAdmin(admin.user.id)
    const riya = await registerUser('riya')
    const aman = await registerUser('aman')
    await subscribe(riya.agent, 1)
    await subscribe(aman.agent, 2)

    addConnection(aman.user.id) // Aman is using PingMe right now
    await admin.agent.post('/api/admin/updates').send({ text: 'New: PingMe is now an app 📱' })
    // Riya's push going out means the online check for both has been made.
    await vi.waitFor(() => expect(send).toHaveBeenCalled())
    removeConnection(aman.user.id)
    await settle()

    expect(pushed()).toEqual([
      {
        endpoint: subscription(1).endpoint,
        payload: { title: 'PingMe', body: 'New: PingMe is now an app 📱', tag: 'pingme-updates', open: 'pingme-updates' },
      },
    ])
  })

  it('a finished PingMe AI answer, without its Markdown symbols', async () => {
    const riya = await registerUser('riya')
    await subscribe(riya.agent)
    await notifyAiAnswer(riya.user.id, { text: '**Recursion** is when a function calls `itself`.' })
    expect(pushed()[0].payload).toEqual({
      title: 'PingMe AI',
      body: 'Recursion is when a function calls itself.',
      tag: 'pingme-ai',
      open: 'pingme-ai',
    })
  })
})

describe('push: signed-out devices stop getting notifications', () => {
  it('changing my password removes every device (this one subscribes again)', async () => {
    const riya = await registerUser('riya')
    await subscribe(riya.agent, 1)
    await subscribe(riya.agent, 2)
    const res = await riya.agent.patch('/api/auth/password').send({ currentPassword: 'password123', newPassword: 'newpassword456' })
    expect(res.status).toBe(200)
    expect(await PushSubscription.countDocuments()).toBe(0)
  })

  it('an admin suspending or deleting an account removes its devices', async () => {
    const admin = await registerUser('boss')
    await makeAdmin(admin.user.id)
    const riya = await registerUser('riya')
    const aman = await registerUser('aman')
    await subscribe(riya.agent, 1)
    await subscribe(aman.agent, 2)

    await admin.agent.patch(`/api/admin/users/${riya.user.id}/suspend`)
    expect(await PushSubscription.countDocuments({ user: riya.user.id })).toBe(0)
    await admin.agent.delete(`/api/admin/users/${aman.user.id}`)
    expect(await PushSubscription.countDocuments()).toBe(0)
  })
})
