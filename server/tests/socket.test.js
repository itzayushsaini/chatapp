import http from 'node:http'

import { io as connectClient } from 'socket.io-client'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import app from '../src/app.js'
import { Conversation } from '../src/models/Conversation.js'
import { Message } from '../src/models/Message.js'
import { User } from '../src/models/User.js'
import { initSocket } from '../src/socket/index.js'
import { PDF, PNG, makeFriends, registerUser, upload } from './helpers.js'

// A real http server + Socket.IO on a random free port, and real
// socket.io-client connections - the same code path a browser uses.
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

// Opens a socket with the given session cookie (like a browser tab).
// Listeners passed in are attached BEFORE connecting, so the very first
// events (presence:snapshot) are not missed.
function connect(cookie, listenFor = []) {
  const socket = connectClient(url, {
    transports: ['websocket'],
    extraHeaders: cookie ? { cookie } : {},
    reconnection: false,
    forceNew: true,
  })
  clients.push(socket)
  const received = Object.fromEntries(listenFor.map((e) => [e, waitFor(socket, e)]))

  return new Promise((resolve, reject) => {
    socket.on('connect', () => resolve({ socket, received }))
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

// Resolves true if the event did NOT arrive within `ms`.
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

const sendMessage = (socket, payload) => socket.emitWithAck('message:send', payload)
const newMessage = (conversationId, text = 'hello') => ({
  conversationId,
  text,
  clientId: crypto.randomUUID(),
})

describe('handshake authentication', () => {
  it('rejects a connection with no cookie', async () => {
    await expect(connect(null)).rejects.toThrow('Unauthorized')
  })

  it('rejects a forged token', async () => {
    await expect(connect('token=forged.token.value')).rejects.toThrow('Unauthorized')
  })

  it('accepts a valid session cookie', async () => {
    const { cookie } = await registerUser('aman')
    const { socket } = await connect(cookie)
    expect(socket.connected).toBe(true)
  })
})

describe('message:send', () => {
  it('saves, acks the sender and delivers to the recipient and my other tabs', async () => {
    const { a, b, conversationId } = await makeFriends('aman', 'priya')
    const { socket: aTab1 } = await connect(a.cookie)
    const { socket: aTab2 } = await connect(a.cookie)
    const { socket: bTab } = await connect(b.cookie)

    const toB = waitFor(bTab, 'message:new')
    const toMyOtherTab = waitFor(aTab2, 'message:new')
    const notToSendingTab = staysSilent(aTab1, 'message:new')

    const payload = newMessage(conversationId, '  hi priya  ')
    const ack = await sendMessage(aTab1, payload)

    expect(ack.ok).toBe(true)
    expect(ack.message).toEqual({
      id: expect.any(String),
      conversationId,
      senderId: a.user.id,
      text: 'hi priya', // trimmed
      clientId: payload.clientId,
      attachment: null,
      replyTo: null,
      forwarded: false,
      deletedForEveryone: false,
      createdAt: expect.any(String),
    })
    expect(await toB).toEqual(ack.message)
    expect(await toMyOtherTab).toEqual(ack.message)
    expect(await notToSendingTab).toBe(true)

    expect(await Message.countDocuments()).toBe(1)
    const conversation = await Conversation.findById(conversationId)
    expect(conversation.lastMessage.text).toBe('hi priya')
  })

  it('stores the message for an offline recipient', async () => {
    const { a, b, conversationId } = await makeFriends('aman', 'priya')
    const { socket } = await connect(a.cookie)

    const ack = await sendMessage(socket, newMessage(conversationId))
    expect(ack.ok).toBe(true)

    const history = await b.agent.get(`/api/conversations/${conversationId}/messages`)
    expect(history.body.messages.map((m) => m.id)).toEqual([ack.message.id])
  })

  it('is idempotent: a retry with the same clientId returns the same message', async () => {
    const { a, b, conversationId } = await makeFriends('aman', 'priya')
    const { socket } = await connect(a.cookie)
    const { socket: bTab } = await connect(b.cookie)
    const payload = newMessage(conversationId)

    // Listen BEFORE sending: the event may arrive before the ack does.
    const delivered = waitFor(bTab, 'message:new')
    const first = await sendMessage(socket, payload)
    await delivered
    const bSilent = staysSilent(bTab, 'message:new')
    const retry = await sendMessage(socket, payload)

    expect(retry).toEqual(first)
    expect(await Message.countDocuments()).toBe(1)
    expect(await bSilent).toBe(true) // the retry is not delivered twice
  })

  it('refuses a conversation I am not in, with 404 wording, and emits nothing', async () => {
    const { b, conversationId } = await makeFriends('aman', 'priya')
    const outsider = await registerUser('rahul')
    const { socket } = await connect(outsider.cookie)
    const { socket: bTab } = await connect(b.cookie)
    const bSilent = staysSilent(bTab, 'message:new')

    const ack = await sendMessage(socket, newMessage(conversationId))

    expect(ack).toEqual({ ok: false, error: 'Conversation not found' })
    expect(await bSilent).toBe(true)
    expect(await Message.countDocuments()).toBe(0)
  })

  it('refuses once we are no longer friends (read-only chat)', async () => {
    const { a, b, conversationId } = await makeFriends('aman', 'priya')
    await a.agent.delete(`/api/friends/${b.user.id}`)
    const { socket } = await connect(a.cookie)

    const ack = await sendMessage(socket, newMessage(conversationId))

    expect(ack).toEqual({ ok: false, error: 'You can only message friends' })
    expect(await Message.countDocuments()).toBe(0)
  })

  it.each([
    ['empty text', { text: '   ' }],
    ['text over 2000 characters', { text: 'x'.repeat(2001) }],
    ['a bad conversation id', { conversationId: 'nope' }],
    ['a bad clientId', { clientId: 'not-a-uuid' }],
    ['an operator object as text', { text: { $gt: '' } }],
  ])('rejects %s', async (_label, change) => {
    const { a, conversationId } = await makeFriends('aman', 'priya')
    const { socket } = await connect(a.cookie)

    const ack = await sendMessage(socket, { ...newMessage(conversationId), ...change })

    expect(ack.ok).toBe(false)
    expect(typeof ack.error).toBe('string')
    expect(await Message.countDocuments()).toBe(0)
  })

  it('survives an event with no ack callback and a null payload', async () => {
    const { a, conversationId } = await makeFriends('aman', 'priya')
    const { socket } = await connect(a.cookie)

    socket.emit('message:send', newMessage(conversationId)) // no ack
    const bad = await sendMessage(socket, null)
    const good = await sendMessage(socket, newMessage(conversationId))

    expect(bad.ok).toBe(false)
    expect(good.ok).toBe(true)
    expect(socket.connected).toBe(true)
  })

  it('rate limits to 10 messages per 5 seconds', async () => {
    const { a, conversationId } = await makeFriends('aman', 'priya')
    const { socket } = await connect(a.cookie)

    const acks = []
    for (let i = 0; i < 11; i++) acks.push(await sendMessage(socket, newMessage(conversationId)))

    expect(acks.slice(0, 10).every((ack) => ack.ok)).toBe(true)
    expect(acks[10]).toEqual({ ok: false, error: 'Slow down' })
  })
})

describe('presence', () => {
  it('snapshot lists online friends; friends get online/offline updates', async () => {
    const { a, b } = await makeFriends('aman', 'priya')
    const { socket: aTab } = await connect(a.cookie)

    const aSeesOnline = waitFor(aTab, 'presence:update')
    const { received } = await connect(b.cookie, ['presence:snapshot'])

    expect(await aSeesOnline).toEqual({ userId: b.user.id, online: true })
    expect(await received['presence:snapshot']).toEqual({ online: [a.user.id] })

    const aSeesOffline = waitFor(aTab, 'presence:update')
    clients.find((c) => c !== aTab).disconnect()

    const update = await aSeesOffline
    expect(update).toMatchObject({ userId: b.user.id, online: false })
    expect(typeof update.lastSeen).toBe('string')
    expect((await User.findById(b.user.id)).lastSeen).toBeInstanceOf(Date)
  })

  it('closing one of two tabs does NOT show the user as offline', async () => {
    const { a, b } = await makeFriends('aman', 'priya')
    const { socket: aTab } = await connect(a.cookie)
    const { socket: bTab1 } = await connect(b.cookie)
    await connect(b.cookie)

    const silent = staysSilent(aTab, 'presence:update', 500)
    bTab1.disconnect()

    expect(await silent).toBe(true)
  })

  it('is never sent to strangers', async () => {
    const stranger = await registerUser('rahul')
    const aman = await registerUser('aman')
    const { socket: strangerTab, received } = await connect(stranger.cookie, ['presence:snapshot'])

    const silent = staysSilent(strangerTab, 'presence:update')
    await connect(aman.cookie)

    expect(await silent).toBe(true)
    expect(await received['presence:snapshot']).toEqual({ online: [] })
  })
})

describe('friend events from REST', () => {
  it('friend:request:new reaches the recipient with the requester public user', async () => {
    const aman = await registerUser('aman')
    const priya = await registerUser('priya')
    const { socket } = await connect(priya.cookie)

    const event = waitFor(socket, 'friend:request:new')
    await aman.agent.post('/api/friends/requests').send({ username: 'priya' })

    expect(await event).toEqual({
      request: {
        id: expect.any(String),
        user: { id: aman.user.id, username: 'aman', displayName: 'aman', bio: '', avatarUrl: null },
        createdAt: expect.any(String),
      },
    })
  })

  it('friend:request:accepted reaches the requester; presence follows if online', async () => {
    const aman = await registerUser('aman')
    const priya = await registerUser('priya')
    const { socket: amanTab } = await connect(aman.cookie)
    await connect(priya.cookie)
    const sent = await aman.agent.post('/api/friends/requests').send({ username: 'priya' })

    const accepted = waitFor(amanTab, 'friend:request:accepted')
    const presence = waitFor(amanTab, 'presence:update')
    await priya.agent.post(`/api/friends/requests/${sent.body.request.id}/accept`)

    const { friend } = await accepted
    expect(friend.friend.username).toBe('priya')
    expect(friend.online).toBe(true)
    expect(await presence).toEqual({ userId: priya.user.id, online: true })
  })

  it('decline is NOT announced to the requester', async () => {
    const aman = await registerUser('aman')
    const priya = await registerUser('priya')
    const { socket: amanTab } = await connect(aman.cookie)
    const sent = await aman.agent.post('/api/friends/requests').send({ username: 'priya' })

    const silent = staysSilent(amanTab, 'friend:request:accepted')
    await priya.agent.post(`/api/friends/requests/${sent.body.request.id}/decline`)

    expect(await silent).toBe(true)
  })

  it('friend:request:cancelled reaches the recipient', async () => {
    const aman = await registerUser('aman')
    const priya = await registerUser('priya')
    const { socket } = await connect(priya.cookie)
    const sent = await aman.agent.post('/api/friends/requests').send({ username: 'priya' })

    const event = waitFor(socket, 'friend:request:cancelled')
    await aman.agent.delete(`/api/friends/requests/${sent.body.request.id}`)

    expect(await event).toEqual({ requestId: sent.body.request.id })
  })

  it('friend:removed reaches both users', async () => {
    const { a, b } = await makeFriends('aman', 'priya')
    const { socket: aTab } = await connect(a.cookie)
    const { socket: bTab } = await connect(b.cookie)

    const toA = waitFor(aTab, 'friend:removed')
    const toB = waitFor(bTab, 'friend:removed')
    await a.agent.delete(`/api/friends/${b.user.id}`)

    expect(await toA).toEqual({ userId: b.user.id })
    expect(await toB).toEqual({ userId: a.user.id })
  })
})

describe('message:send with an attachment', () => {
  // Uploads a file as `who` and returns its attachment view.
  async function uploaded(who, conversationId, bytes = PNG, name = 'photo.png') {
    const res = await upload(who.agent, conversationId, bytes, name)
    return res.body.attachment
  }

  it('sends a photo with a caption: saved, delivered and in history', async () => {
    const { a, b, conversationId } = await makeFriends('aman', 'priya')
    const attachment = await uploaded(a, conversationId)
    const { socket } = await connect(a.cookie)
    const { socket: bTab } = await connect(b.cookie)

    const toB = waitFor(bTab, 'message:new')
    const ack = await sendMessage(socket, {
      ...newMessage(conversationId, 'Look at this'),
      attachmentId: attachment.id,
    })

    expect(ack.ok).toBe(true)
    expect(ack.message).toMatchObject({ text: 'Look at this', attachment })
    expect(await toB).toEqual(ack.message)

    // The other person can now download it.
    expect((await b.agent.get(attachment.url)).status).toBe(200)

    const history = await b.agent.get(`/api/conversations/${conversationId}/messages`)
    expect(history.body.messages[0].attachment).toEqual(attachment)
  })

  it('sends a file with no text, and the sidebar preview names it', async () => {
    const { a, b, conversationId } = await makeFriends('aman', 'priya')
    const attachment = await uploaded(a, conversationId, PDF, 'notes.pdf')
    const { socket } = await connect(a.cookie)

    const ack = await sendMessage(socket, {
      conversationId,
      clientId: crypto.randomUUID(),
      attachmentId: attachment.id,
    })

    expect(ack.ok).toBe(true)
    expect(ack.message.text).toBe('')

    const friends = await b.agent.get('/api/friends')
    expect(friends.body.friends[0].lastMessage).toMatchObject({
      text: '',
      attachment: { kind: 'file', name: 'notes.pdf' },
    })
  })

  it('refuses an empty message with no attachment', async () => {
    const { a, conversationId } = await makeFriends('aman', 'priya')
    const { socket } = await connect(a.cookie)

    const ack = await sendMessage(socket, { conversationId, text: '', clientId: crypto.randomUUID() })
    expect(ack).toEqual({ ok: false, error: 'Message is empty' })
  })

  it('an attachment can be used by only one message', async () => {
    const { a, conversationId } = await makeFriends('aman', 'priya')
    const attachment = await uploaded(a, conversationId)
    const { socket } = await connect(a.cookie)

    const first = await sendMessage(socket, { ...newMessage(conversationId), attachmentId: attachment.id })
    const second = await sendMessage(socket, { ...newMessage(conversationId), attachmentId: attachment.id })

    expect(first.ok).toBe(true)
    expect(second).toEqual({ ok: false, error: 'Attachment not found' })
    expect(await Message.countDocuments()).toBe(1)
  })

  it("cannot send someone else's upload", async () => {
    const { a, b, conversationId } = await makeFriends('aman', 'priya')
    const theirs = await uploaded(b, conversationId)
    const { socket } = await connect(a.cookie)

    const ack = await sendMessage(socket, { ...newMessage(conversationId), attachmentId: theirs.id })
    expect(ack).toEqual({ ok: false, error: 'Attachment not found' })
  })

  it('cannot move an upload into a different conversation', async () => {
    const { a, conversationId: withPriya } = await makeFriends('aman', 'priya')
    const rahul = await registerUser('rahul')
    const sent = await a.agent.post('/api/friends/requests').send({ username: 'rahul' })
    const accepted = await rahul.agent.post(`/api/friends/requests/${sent.body.request.id}/accept`)
    const withRahul = accepted.body.friend.conversationId

    const forPriya = await uploaded(a, withPriya)
    const { socket } = await connect(a.cookie)

    const ack = await sendMessage(socket, { ...newMessage(withRahul), attachmentId: forPriya.id })
    expect(ack).toEqual({ ok: false, error: 'Attachment not found' })
    expect((await rahul.agent.get(forPriya.url)).status).toBe(404)
  })

  it('a retry with the same clientId returns the same message, attachment included', async () => {
    const { a, conversationId } = await makeFriends('aman', 'priya')
    const attachment = await uploaded(a, conversationId)
    const { socket } = await connect(a.cookie)
    const payload = { ...newMessage(conversationId), attachmentId: attachment.id }

    const first = await sendMessage(socket, payload)
    const retry = await sendMessage(socket, payload)

    expect(retry).toEqual(first)
    expect(await Message.countDocuments()).toBe(1)
  })
})

describe('user:updated', () => {
  it('reaches friends, people with a pending request and my other tabs - not strangers', async () => {
    const { a, b } = await makeFriends('aman', 'priya')
    const pending = await registerUser('sneha')
    await pending.agent.post('/api/friends/requests').send({ username: 'aman' })
    const stranger = await registerUser('rahul')

    const { socket: friendTab } = await connect(b.cookie)
    const { socket: pendingTab } = await connect(pending.cookie)
    const { socket: strangerTab } = await connect(stranger.cookie)
    const { socket: myOtherTab } = await connect(a.cookie)

    const toFriend = waitFor(friendTab, 'user:updated')
    const toPending = waitFor(pendingTab, 'user:updated')
    const toMe = waitFor(myOtherTab, 'user:updated')
    const strangerSilent = staysSilent(strangerTab, 'user:updated')

    await a.agent.patch('/api/users/me').send({ displayName: 'Aman Verma', bio: 'hi' })

    const publicShape = {
      id: a.user.id,
      username: 'aman',
      displayName: 'Aman Verma',
      bio: 'hi',
      avatarUrl: null,
    }
    expect(await toFriend).toEqual({ user: publicShape })
    expect(await toPending).toEqual({ user: publicShape })
    // My own tabs also get my private fields.
    expect((await toMe).user).toMatchObject({ ...publicShape, email: 'aman@gmail.com' })
    expect(await strangerSilent).toBe(true)
  })

  it('is sent when the picture changes', async () => {
    const { a, b } = await makeFriends('aman', 'priya')
    const { socket } = await connect(b.cookie)

    const event = waitFor(socket, 'user:updated')
    await a.agent.put('/api/users/me/avatar').attach('avatar', PNG, 'me.png')

    expect((await event).user.avatarUrl).toMatch(/^\/api\/users\/.+\/avatar\?v=/)
  })
})
