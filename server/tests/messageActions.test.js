import http from 'node:http'

import { io as connectClient } from 'socket.io-client'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import app from '../src/app.js'
import { Conversation } from '../src/models/Conversation.js'
import { Message } from '../src/models/Message.js'
import { initSocket } from '../src/socket/index.js'
import { PNG, makeFriends, registerUser, upload } from './helpers.js'

// Same real http server + Socket.IO setup as socket.test.js.
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
    socket.on('connect', () => resolve({ socket }))
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

const send = (socket, payload) =>
  socket.emitWithAck('message:send', {
    text: 'hi',
    clientId: crypto.randomUUID(),
    ...payload,
  })
const del = (socket, payload) => socket.emitWithAck('message:delete', payload)
const forward = (socket, payload) => socket.emitWithAck('message:forward', payload)

// Friends up an ALREADY-registered pair without creating new accounts - for
// scenarios where the same user needs a second, separate friend.
async function friendUp(requesterAgent, recipientUsername, recipientAgent) {
  const sent = await requesterAgent.post('/api/friends/requests').send({ username: recipientUsername })
  const accepted = await recipientAgent.post(`/api/friends/requests/${sent.body.request.id}/accept`)
  return accepted.body.friend.conversationId
}

describe('replying to a message', () => {
  it('includes a snapshot of the original in the reply preview', async () => {
    const { a, b, conversationId } = await makeFriends('aman', 'priya')
    const { socket: aSocket } = await connect(a.cookie)
    const { socket: bSocket } = await connect(b.cookie)

    const original = await send(aSocket, { conversationId, text: 'are we still on for lunch?' })
    // b is the one replying, so it's a (the OTHER participant) who gets the
    // live event - the sender itself only gets the ack.
    const toA = waitFor(aSocket, 'message:new')
    const reply = await send(bSocket, {
      conversationId,
      text: 'yes!',
      replyToId: original.message.id,
    })

    expect(reply.ok).toBe(true)
    expect(reply.message.replyTo).toEqual({
      messageId: original.message.id,
      senderId: a.user.id,
      textSnippet: 'are we still on for lunch?',
      attachmentKind: null,
    })
    expect(await toA).toEqual(reply.message)
  })

  it('sends normally, with no reply, if the referenced message does not exist', async () => {
    const { a, conversationId } = await makeFriends('aman', 'priya')
    const { socket } = await connect(a.cookie)

    const fakeId = '507f1f77bcf86cd799439011'
    const ack = await send(socket, { conversationId, text: 'hello', replyToId: fakeId })

    expect(ack.ok).toBe(true)
    expect(ack.message.replyTo).toBeNull()
  })
})

describe('message:delete', () => {
  it('"for me" hides the message only on my own devices, not the other person\'s', async () => {
    const { a, b, conversationId } = await makeFriends('aman', 'priya')
    const { socket: aTab1 } = await connect(a.cookie)
    const { socket: aTab2 } = await connect(a.cookie)
    const { socket: bSocket } = await connect(b.cookie)

    const sent = await send(aTab1, { conversationId, text: 'oops wrong chat' })

    const myOtherTabHears = waitFor(aTab2, 'message:deleted')
    const bStaysQuiet = staysSilent(bSocket, 'message:deleted')

    const ack = await del(aTab1, { conversationId, messageId: sent.message.id, mode: 'me' })
    expect(ack.ok).toBe(true)
    expect(await myOtherTabHears).toEqual({ conversationId, messageId: sent.message.id, mode: 'me' })
    expect(await bStaysQuiet).toBe(true)

    const aHistory = await a.agent.get(`/api/conversations/${conversationId}/messages`)
    const bHistory = await b.agent.get(`/api/conversations/${conversationId}/messages`)
    expect(aHistory.body.messages.find((m) => m.id === sent.message.id)).toBeUndefined()
    expect(bHistory.body.messages.find((m) => m.id === sent.message.id)).toBeDefined()
  })

  it('"for everyone" by the sender soft-deletes it for both, and tells both', async () => {
    const { a, b, conversationId } = await makeFriends('aman', 'priya')
    const { socket: aSocket } = await connect(a.cookie)
    const { socket: bSocket } = await connect(b.cookie)

    const sent = await send(aSocket, { conversationId, text: 'secret plan' })
    const bHears = waitFor(bSocket, 'message:deleted')

    const ack = await del(aSocket, { conversationId, messageId: sent.message.id, mode: 'everyone' })
    expect(ack.ok).toBe(true)
    // It was the only message, so the preview is recomputed to null, not
    // just left alone.
    expect(await bHears).toEqual({
      conversationId,
      messageId: sent.message.id,
      mode: 'everyone',
      lastMessage: null,
    })

    const bHistory = await b.agent.get(`/api/conversations/${conversationId}/messages`)
    const seen = bHistory.body.messages.find((m) => m.id === sent.message.id)
    expect(seen.deletedForEveryone).toBe(true)
    expect(seen.text).toBe('')
  })

  it('refuses "for everyone" from anyone but the sender', async () => {
    const { a, b, conversationId } = await makeFriends('aman', 'priya')
    const { socket: aSocket } = await connect(a.cookie)
    const { socket: bSocket } = await connect(b.cookie)

    const sent = await send(aSocket, { conversationId, text: 'mine only' })
    const ack = await del(bSocket, { conversationId, messageId: sent.message.id, mode: 'everyone' })

    expect(ack.ok).toBe(false)
    expect(ack.error).toBe('You can only delete your own messages for everyone')
  })

  it('refuses "for everyone" once the message is too old', async () => {
    const { a, conversationId } = await makeFriends('aman', 'priya')
    const { socket: aSocket } = await connect(a.cookie)

    // createdAt is immutable once set, so an old message is inserted
    // directly (as conversations.test.js does for history) rather than sent
    // and then backdated.
    const old = await Message.create({
      conversation: conversationId,
      sender: a.user.id,
      text: 'ancient history',
      clientId: crypto.randomUUID(),
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    })

    const ack = await del(aSocket, { conversationId, messageId: String(old._id), mode: 'everyone' })
    expect(ack.ok).toBe(false)
    expect(ack.error).toBe('This message is too old to delete for everyone')
  })

  it('recomputes the sidebar preview when the deleted message was the newest one', async () => {
    const { a, conversationId } = await makeFriends('aman', 'priya')
    const { socket: aSocket } = await connect(a.cookie)

    await send(aSocket, { conversationId, text: 'first' })
    const second = await send(aSocket, { conversationId, text: 'second' })

    const ack = await del(aSocket, { conversationId, messageId: second.message.id, mode: 'everyone' })
    expect(ack.lastMessage).toMatchObject({ text: 'first' })

    const conversation = await Conversation.findById(conversationId)
    expect(conversation.lastMessage.text).toBe('first')
  })

  it('returns 404 for a message in a conversation I am not part of', async () => {
    const { a, conversationId } = await makeFriends('aman', 'priya')
    const stranger = await registerUser('rahul')
    const { socket: aSocket } = await connect(a.cookie)
    const { socket: strangerSocket } = await connect(stranger.cookie)

    const sent = await send(aSocket, { conversationId, text: 'private' })
    const ack = await del(strangerSocket, { conversationId, messageId: sent.message.id, mode: 'me' })

    expect(ack.ok).toBe(false)
    expect(ack.error).toBe('Conversation not found')
  })
})

describe('message:forward', () => {
  it('copies text and attachment into another conversation, marked as forwarded', async () => {
    const { a, conversationId: abId } = await makeFriends('aman', 'priya')
    const c = await registerUser('rahul')
    const acId = await friendUp(a.agent, 'rahul', c.agent)
    const { socket: aSocket } = await connect(a.cookie)

    const uploaded = await upload(a.agent, abId, PNG, 'photo.png')
    const original = await send(aSocket, {
      conversationId: abId,
      text: 'check this out',
      attachmentId: uploaded.body.attachment.id,
    })

    const ack = await forward(aSocket, { messageId: original.message.id, toConversationIds: [acId] })

    expect(ack.ok).toBe(true)
    expect(ack.results).toHaveLength(1)
    expect(ack.results[0].ok).toBe(true)
    expect(ack.results[0].message.forwarded).toBe(true)
    expect(ack.results[0].message.text).toBe('check this out')
    expect(ack.results[0].message.attachment.name).toBe('photo.png')
    expect(ack.results[0].message.id).not.toBe(original.message.id)
  })

  it('forwards to several chats in one go, one per target result', async () => {
    const { a, conversationId: abId } = await makeFriends('aman', 'priya')
    const c = await registerUser('rahul')
    const acId = await friendUp(a.agent, 'rahul', c.agent)
    const { socket: aSocket } = await connect(a.cookie)

    const original = await send(aSocket, { conversationId: abId, text: 'group news' })
    const ack = await forward(aSocket, {
      messageId: original.message.id,
      toConversationIds: [acId],
    })

    expect(ack.ok).toBe(true)
    expect(ack.results.map((r) => r.ok)).toEqual([true])
  })

  it('reports a per-target failure without blocking the other targets', async () => {
    const { a, conversationId: abId } = await makeFriends('aman', 'priya')
    const outsiders = await makeFriends('chetan', 'divya') // a is not part of this one

    const { socket: aSocket } = await connect(a.cookie)
    const original = await send(aSocket, { conversationId: abId, text: 'hello' })

    const ack = await forward(aSocket, {
      messageId: original.message.id,
      toConversationIds: [outsiders.conversationId],
    })

    expect(ack.ok).toBe(true)
    expect(ack.results[0].ok).toBe(false)
    expect(ack.results[0].error).toBe('Conversation not found')
  })

  it('refuses to forward a message that was deleted for everyone', async () => {
    const { a, conversationId: abId } = await makeFriends('aman', 'priya')
    const c = await registerUser('rahul')
    const acId = await friendUp(a.agent, 'rahul', c.agent)
    const { socket: aSocket } = await connect(a.cookie)

    const original = await send(aSocket, { conversationId: abId, text: 'temporary' })
    await del(aSocket, { conversationId: abId, messageId: original.message.id, mode: 'everyone' })

    const ack = await forward(aSocket, { messageId: original.message.id, toConversationIds: [acId] })
    expect(ack.ok).toBe(false)
    expect(ack.error).toBe('This message can no longer be forwarded')
  })

  it('returns 404 for a message I never had access to', async () => {
    const { conversationId: abId } = await makeFriends('aman', 'priya')
    const outsider = await registerUser('rahul')
    const { socket: outsiderSocket } = await connect(outsider.cookie)

    const owner = await registerUser('aman2')
    const message = await Message.create({
      conversation: abId,
      sender: owner.user.id,
      text: 'not yours',
      clientId: crypto.randomUUID(),
    })

    const ack = await forward(outsiderSocket, {
      messageId: String(message._id),
      toConversationIds: [abId],
    })
    expect(ack.ok).toBe(false)
    expect(ack.error).toBe('Conversation not found')
  })
})
