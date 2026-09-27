import { describe, expect, it } from 'vitest'

import { Message } from '../src/models/Message.js'
import { makeFriends, registerUser } from './helpers.js'

// Messages are only ever SENT over the socket, so these tests insert them
// directly to have some history to page through.
async function insertMessages(conversationId, senderId, count) {
  const ids = []
  for (let i = 1; i <= count; i++) {
    const m = await Message.create({
      conversation: conversationId,
      sender: senderId,
      text: `message ${i}`,
      clientId: crypto.randomUUID(),
    })
    ids.push(String(m._id))
  }
  return ids
}

describe('GET /api/conversations/:id/messages', () => {
  it('returns the latest 30, oldest -> newest, with hasMore', async () => {
    const { a, conversationId } = await makeFriends('aman', 'priya')
    await insertMessages(conversationId, a.user.id, 35)

    const res = await a.agent.get(`/api/conversations/${conversationId}/messages`)

    expect(res.status).toBe(200)
    expect(res.body.hasMore).toBe(true)
    expect(res.body.messages).toHaveLength(30)
    expect(res.body.messages[0].text).toBe('message 6')
    expect(res.body.messages[29].text).toBe('message 35')
    expect(res.body.messages[0]).toEqual({
      id: expect.any(String),
      conversationId,
      senderId: a.user.id,
      text: 'message 6',
      clientId: expect.any(String),
      attachment: null,
      replyTo: null,
      forwarded: false,
      deletedForEveryone: false,
      createdAt: expect.any(String),
    })
  })

  it('pages backwards with ?before= and stops with hasMore false', async () => {
    const { a, conversationId } = await makeFriends('aman', 'priya')
    await insertMessages(conversationId, a.user.id, 35)

    const first = await a.agent.get(`/api/conversations/${conversationId}/messages`)
    const oldestId = first.body.messages[0].id
    const second = await a.agent.get(
      `/api/conversations/${conversationId}/messages?before=${oldestId}`,
    )

    expect(second.body.hasMore).toBe(false)
    expect(second.body.messages.map((m) => m.text)).toEqual([
      'message 1',
      'message 2',
      'message 3',
      'message 4',
      'message 5',
    ])
  })

  it('respects limit and caps it at 50', async () => {
    const { a, conversationId } = await makeFriends('aman', 'priya')
    await insertMessages(conversationId, a.user.id, 3)

    const small = await a.agent.get(`/api/conversations/${conversationId}/messages?limit=2`)
    expect(small.body.messages).toHaveLength(2)
    expect(small.body.hasMore).toBe(true)

    const tooBig = await a.agent.get(`/api/conversations/${conversationId}/messages?limit=51`)
    expect(tooBig.status).toBe(400)
  })

  it('returns 404 (not 403) to someone outside the conversation', async () => {
    const { conversationId } = await makeFriends('aman', 'priya')
    const outsider = await registerUser('rahul')

    const res = await outsider.agent.get(`/api/conversations/${conversationId}/messages`)

    expect(res.status).toBe(404)
    expect(res.body).toEqual({ message: 'Conversation not found' })
  })

  it('returns 404 for a conversation that does not exist', async () => {
    const { a } = await makeFriends('aman', 'priya')
    const res = await a.agent.get('/api/conversations/507f1f77bcf86cd799439011/messages')
    expect(res.status).toBe(404)
  })

  it('returns 400 for a malformed id or cursor', async () => {
    const { a, conversationId } = await makeFriends('aman', 'priya')
    expect((await a.agent.get('/api/conversations/nope/messages')).status).toBe(400)
    expect(
      (await a.agent.get(`/api/conversations/${conversationId}/messages?before=nope`)).status,
    ).toBe(400)
  })

  it('history stays readable after unfriending (read-only chat)', async () => {
    const { a, b, conversationId } = await makeFriends('aman', 'priya')
    await insertMessages(conversationId, a.user.id, 2)
    await a.agent.delete(`/api/friends/${b.user.id}`)

    const res = await b.agent.get(`/api/conversations/${conversationId}/messages`)
    expect(res.status).toBe(200)
    expect(res.body.messages).toHaveLength(2)
  })
})
