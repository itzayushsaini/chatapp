import http from 'node:http'

import { io as connectClient } from 'socket.io-client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import app from '../src/app.js'
import { Conversation } from '../src/models/Conversation.js'
import { initSocket } from '../src/socket/index.js'
import { makeFriends, registerUser } from './helpers.js'

// Same live http+socket server pattern as socket.test.js, scoped to this
// file so it can run independently.
let httpServer
let io
let url
const clients = []

beforeEach(async () => {
  httpServer = http.createServer(app)
  io = initSocket(httpServer)
  await new Promise((resolve) => httpServer.listen(0, resolve))
  url = `http://localhost:${httpServer.address().port}`
})

afterEach(async () => {
  while (clients.length) clients.pop().disconnect()
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

async function sendAndGetId(socket, conversationId, text = 'hi') {
  const ack = await socket.emitWithAck('message:send', {
    conversationId,
    text,
    clientId: crypto.randomUUID(),
  })
  return ack.message.id
}

describe('conversation:read', () => {
  it('marks read and tells the sender, moving the pointer forward', async () => {
    const { a, b, conversationId } = await makeFriends('aman', 'priya')
    const aSocket = await connect(a.cookie)
    const bSocket = await connect(b.cookie)
    const messageId = await sendAndGetId(aSocket, conversationId)

    const readEvent = waitFor(aSocket, 'message:read')
    const ack = await bSocket.emitWithAck('conversation:read', {
      conversationId,
      upToMessageId: messageId,
    })

    expect(ack).toEqual({ ok: true })
    expect(await readEvent).toEqual({ conversationId, upToMessageId: messageId })

    const conversation = await Conversation.findById(conversationId)
    expect(String(conversation.lastRead.get(String(b.user.id)).upTo)).toBe(messageId)
  })

  it('is reflected in history as theirReadUpTo', async () => {
    const { a, b, conversationId } = await makeFriends('aman', 'priya')
    const aSocket = await connect(a.cookie)
    const messageId = await sendAndGetId(aSocket, conversationId)

    const before = await a.agent.get(`/api/conversations/${conversationId}/messages`)
    expect(before.body.theirReadUpTo).toBeNull()

    const bSocket = await connect(b.cookie)
    await bSocket.emitWithAck('conversation:read', { conversationId, upToMessageId: messageId })

    const after = await a.agent.get(`/api/conversations/${conversationId}/messages`)
    expect(after.body.theirReadUpTo).toBe(messageId)
  })

  it('does not notify the sender again for an older or equal pointer', async () => {
    const { a, b, conversationId } = await makeFriends('aman', 'priya')
    const aSocket = await connect(a.cookie)
    const bSocket = await connect(b.cookie)
    const first = await sendAndGetId(aSocket, conversationId, 'one')
    const second = await sendAndGetId(aSocket, conversationId, 'two')

    await bSocket.emitWithAck('conversation:read', { conversationId, upToMessageId: second })

    const silent = staysSilent(aSocket, 'message:read')
    const ack = await bSocket.emitWithAck('conversation:read', { conversationId, upToMessageId: first })

    expect(ack).toEqual({ ok: true })
    expect(await silent).toBe(true)
  })

  it('rejects a conversation I am not in, and tells nobody', async () => {
    const { b, conversationId } = await makeFriends('aman', 'priya')
    const outsider = await registerUser('rahul')
    const outsiderSocket = await connect(outsider.cookie)
    const bSocket = await connect(b.cookie)

    const silent = staysSilent(bSocket, 'message:read')
    await outsiderSocket.emitWithAck('conversation:read', {
      conversationId,
      upToMessageId: '507f1f77bcf86cd799439011',
    })

    expect(await silent).toBe(true)
    const conversation = await Conversation.findById(conversationId)
    expect(conversation.lastRead.size).toBe(0)
  })

  it('ignores a malformed payload without crashing the socket', async () => {
    const { a, conversationId } = await makeFriends('aman', 'priya')
    const aSocket = await connect(a.cookie)

    await aSocket.emitWithAck('conversation:read', { conversationId })
    await aSocket.emitWithAck('conversation:read', null)
    const good = await aSocket.emitWithAck('conversation:read', {
      conversationId,
      upToMessageId: '507f1f77bcf86cd799439011',
    })

    expect(good).toEqual({ ok: true })
    expect(aSocket.connected).toBe(true)
  })
})
