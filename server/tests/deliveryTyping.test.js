import http from 'node:http'

import { io as connectClient } from 'socket.io-client'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import app from '../src/app.js'
import { initSocket } from '../src/socket/index.js'
import { makeFriends, registerUser } from './helpers.js'

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

function staysSilent(socket, event, ms = 400) {
  return new Promise((resolve) => {
    const onEvent = () => resolve(false)
    socket.once(event, onEvent)
    setTimeout(() => {
      socket.off(event, onEvent)
      resolve(true)
    }, ms)
  })
}

const send = (socket, conversationId, text = 'hi') =>
  socket.emitWithAck('message:send', { conversationId, text, clientId: crypto.randomUUID() })

describe('delivered receipts (grey double tick)', () => {
  it('is announced to the sender straight away when the recipient is online', async () => {
    const { a, b, conversationId } = await makeFriends('aman', 'priya')
    const aSocket = await connect(a.cookie)
    await connect(b.cookie)

    const delivered = waitFor(aSocket, 'message:delivered')
    const ack = await send(aSocket, conversationId)

    // Reaches the SENDING tab too - that is where the ticks are drawn.
    expect(await delivered).toEqual({ conversationId, upToMessageId: ack.message.id })

    const history = await a.agent.get(`/api/conversations/${conversationId}/messages`)
    expect(history.body.theirDeliveredUpTo).toBe(ack.message.id)
    expect(history.body.theirReadUpTo).toBeNull() // delivered is not read
  })

  it('waits while the recipient is offline, then announces it the moment they connect', async () => {
    const { a, b, conversationId } = await makeFriends('aman', 'priya')
    const aSocket = await connect(a.cookie)

    const notYet = staysSilent(aSocket, 'message:delivered')
    const ack = await send(aSocket, conversationId)
    expect(await notYet).toBe(true)

    const delivered = waitFor(aSocket, 'message:delivered')
    await connect(b.cookie)
    expect(await delivered).toEqual({ conversationId, upToMessageId: ack.message.id })
  })

  it('announces nothing again when the recipient reconnects with nothing new', async () => {
    const { a, b, conversationId } = await makeFriends('aman', 'priya')
    const aSocket = await connect(a.cookie)
    await send(aSocket, conversationId)

    const first = waitFor(aSocket, 'message:delivered')
    const bFirst = await connect(b.cookie)
    await first
    bFirst.disconnect()

    const quiet = staysSilent(aSocket, 'message:delivered')
    await connect(b.cookie)
    expect(await quiet).toBe(true)
  })

  it('my own messages never count as delivered TO me', async () => {
    const { a, conversationId } = await makeFriends('aman', 'priya')
    const aSocket = await connect(a.cookie)
    await send(aSocket, conversationId)

    // Reconnecting as the sender must not mark my own message delivered.
    const quiet = staysSilent(aSocket, 'message:delivered')
    await connect(a.cookie)
    expect(await quiet).toBe(true)

    const history = await a.agent.get(`/api/conversations/${conversationId}/messages`)
    expect(history.body.theirDeliveredUpTo).toBeNull()
  })
})

describe('typing indicator', () => {
  it('is relayed to the friend only - not to my own other tabs', async () => {
    const { a, b, conversationId } = await makeFriends('aman', 'priya')
    const aTab1 = await connect(a.cookie)
    const aTab2 = await connect(a.cookie)
    const bSocket = await connect(b.cookie)

    const toB = waitFor(bSocket, 'typing')
    const notToMe = staysSilent(aTab2, 'typing')
    aTab1.emit('typing', { conversationId, isTyping: true })

    expect(await toB).toEqual({ conversationId, userId: a.user.id, isTyping: true })
    expect(await notToMe).toBe(true)

    const stopped = waitFor(bSocket, 'typing')
    aTab1.emit('typing', { conversationId, isTyping: false })
    expect((await stopped).isTyping).toBe(false)
  })

  it('is never relayed by someone outside the conversation', async () => {
    const { b, conversationId } = await makeFriends('aman', 'priya')
    const stranger = await registerUser('rahul')
    const bSocket = await connect(b.cookie)
    const strangerSocket = await connect(stranger.cookie)

    const quiet = staysSilent(bSocket, 'typing')
    strangerSocket.emit('typing', { conversationId, isTyping: true })
    expect(await quiet).toBe(true)
  })

  it('stops once they are no longer friends', async () => {
    const { a, b, conversationId } = await makeFriends('aman', 'priya')
    await a.agent.delete(`/api/friends/${b.user.id}`)
    const aSocket = await connect(a.cookie)
    const bSocket = await connect(b.cookie)

    const quiet = staysSilent(bSocket, 'typing')
    aSocket.emit('typing', { conversationId, isTyping: true })
    expect(await quiet).toBe(true)
  })

  it('ignores a malformed payload without crashing the socket', async () => {
    const { a } = await makeFriends('aman', 'priya')
    const aSocket = await connect(a.cookie)
    aSocket.emit('typing', { conversationId: 'not-an-id', isTyping: 'yes' })
    aSocket.emit('typing', null)
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(aSocket.connected).toBe(true)
  })
})
