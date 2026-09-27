import request from 'supertest'
import { describe, expect, it } from 'vitest'

import app from '../src/app.js'
import { Conversation } from '../src/models/Conversation.js'
import { Friendship } from '../src/models/Friendship.js'
import { Message } from '../src/models/Message.js'
import { makeFriends, registerUser } from './helpers.js'

const send = (agent, username) => agent.post('/api/friends/requests').send({ username })

describe('GET /api/users/search', () => {
  it('finds a user by exact username and returns only public fields', async () => {
    const { agent } = await registerUser('aman')
    await registerUser('priya', { displayName: 'Priya S' })

    const res = await agent.get('/api/users/search?username=priya')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      user: { id: expect.any(String), username: 'priya', displayName: 'Priya S', bio: '', avatarUrl: null },
      relationship: 'none',
    })
  })

  it('normalises case and spaces', async () => {
    const { agent } = await registerUser('aman')
    await registerUser('priya')

    const res = await agent.get('/api/users/search?username=%20PRIYA%20')
    expect(res.status).toBe(200)
  })

  it('does NOT match partial usernames', async () => {
    const { agent } = await registerUser('aman')
    await registerUser('priya')

    for (const partial of ['pri', 'riya', 'p', '.*', 'priy.']) {
      const res = await agent.get(`/api/users/search?username=${encodeURIComponent(partial)}`)
      expect(res.status).toBe(404)
      expect(res.body).toEqual({ message: 'No user found' })
    }
  })

  it('rejects operator injection in the query string', async () => {
    const { agent } = await registerUser('aman')
    const res = await agent.get('/api/users/search?username[$ne]=x')
    expect(res.status).toBe(400)
  })

  it('reports every relationship correctly', async () => {
    const aman = await registerUser('aman')
    const priya = await registerUser('priya')
    const search = (who, name) => who.agent.get(`/api/users/search?username=${name}`)

    expect((await search(aman, 'aman')).body.relationship).toBe('self')

    await send(aman.agent, 'priya')
    expect((await search(aman, 'priya')).body.relationship).toBe('pending_outgoing')
    expect((await search(priya, 'aman')).body.relationship).toBe('pending_incoming')

    const { incoming } = (await priya.agent.get('/api/friends/requests')).body
    await priya.agent.post(`/api/friends/requests/${incoming[0].id}/accept`)
    expect((await search(aman, 'priya')).body.relationship).toBe('friends')
  })

  it('shows a declined request as "none" to both sides', async () => {
    const aman = await registerUser('aman')
    const priya = await registerUser('priya')
    const sent = await send(aman.agent, 'priya')
    await priya.agent.post(`/api/friends/requests/${sent.body.request.id}/decline`)

    const fromAman = await aman.agent.get('/api/users/search?username=priya')
    const fromPriya = await priya.agent.get('/api/users/search?username=aman')
    expect(fromAman.body.relationship).toBe('none')
    expect(fromPriya.body.relationship).toBe('none')
  })

  it('requires login', async () => {
    const res = await request(app).get('/api/users/search?username=aman')
    expect(res.status).toBe(401)
  })
})

describe('POST /api/friends/requests', () => {
  it('creates a pending request (201)', async () => {
    const aman = await registerUser('aman')
    await registerUser('priya')

    const res = await send(aman.agent, 'priya')

    expect(res.status).toBe(201)
    expect(res.body.request).toEqual({
      id: expect.any(String),
      user: { id: expect.any(String), username: 'priya', displayName: 'priya', bio: '', avatarUrl: null },
      createdAt: expect.any(String),
    })
  })

  it('returns 404 for an unknown username', async () => {
    const aman = await registerUser('aman')
    const res = await send(aman.agent, 'ghost')
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ message: 'No user found' })
  })

  it('returns 400 for myself', async () => {
    const aman = await registerUser('aman')
    const res = await send(aman.agent, 'aman')
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ message: "You can't add yourself" })
  })

  it('returns 409 when I already sent one', async () => {
    const aman = await registerUser('aman')
    await registerUser('priya')
    await send(aman.agent, 'priya')

    const res = await send(aman.agent, 'priya')
    expect(res.status).toBe(409)
    expect(res.body).toEqual({ message: 'Request already sent' })
  })

  it('auto-accepts when they had already asked me (200 { friend })', async () => {
    const aman = await registerUser('aman')
    const priya = await registerUser('priya')
    await send(aman.agent, 'priya')

    const res = await send(priya.agent, 'aman')

    expect(res.status).toBe(200)
    expect(res.body.friend.friend.username).toBe('aman')
    expect(await Friendship.countDocuments()).toBe(1)
    expect((await Friendship.findOne()).status).toBe('accepted')
  })

  it('returns 409 when already friends', async () => {
    const { a } = await makeFriends('aman', 'priya')
    const res = await send(a.agent, 'priya')
    expect(res.status).toBe(409)
    expect(res.body).toEqual({ message: 'Already friends' })
  })

  it('makes me wait 7 days after they declined MY request', async () => {
    const aman = await registerUser('aman')
    const priya = await registerUser('priya')
    const sent = await send(aman.agent, 'priya')
    await priya.agent.post(`/api/friends/requests/${sent.body.request.id}/decline`)

    const res = await send(aman.agent, 'priya')
    expect(res.status).toBe(429)
    expect(res.body).toEqual({ message: 'You can send another request later' })
  })

  it('allows a new request once the 7 days have passed, reusing the document', async () => {
    const aman = await registerUser('aman')
    const priya = await registerUser('priya')
    const sent = await send(aman.agent, 'priya')
    await priya.agent.post(`/api/friends/requests/${sent.body.request.id}/decline`)
    await Friendship.updateOne({}, { respondedAt: new Date(Date.now() - 8 * 24 * 3600 * 1000) })

    const res = await send(aman.agent, 'priya')
    expect(res.status).toBe(201)
    expect(await Friendship.countDocuments()).toBe(1)
  })

  it('lets the person who declined send a request straight away', async () => {
    const aman = await registerUser('aman')
    const priya = await registerUser('priya')
    const sent = await send(aman.agent, 'priya')
    await priya.agent.post(`/api/friends/requests/${sent.body.request.id}/decline`)

    const res = await send(priya.agent, 'aman')
    expect(res.status).toBe(201)

    const doc = await Friendship.findOne()
    expect(String(doc.requester)).toBe(priya.user.id)
    expect(doc.status).toBe('pending')
  })

  it('crossed requests at the same moment still produce one document', async () => {
    const aman = await registerUser('aman')
    const priya = await registerUser('priya')

    const results = await Promise.all([send(aman.agent, 'priya'), send(priya.agent, 'aman')])

    expect(results.every((r) => [200, 201, 409].includes(r.status))).toBe(true)
    expect(await Friendship.countDocuments()).toBe(1)
  })
})

describe('accept / decline / cancel', () => {
  async function pending() {
    const aman = await registerUser('aman')
    const priya = await registerUser('priya')
    const sent = await send(aman.agent, 'priya')
    return { aman, priya, id: sent.body.request.id }
  }

  it('accept returns the new friend and creates the conversation', async () => {
    const { priya, id } = await pending()

    const res = await priya.agent.post(`/api/friends/requests/${id}/accept`)

    expect(res.status).toBe(200)
    expect(res.body.friend).toEqual({
      friend: { id: expect.any(String), username: 'aman', displayName: 'aman', bio: '', avatarUrl: null },
      conversationId: expect.any(String),
      lastMessage: null,
      online: false,
      lastSeen: null,
    })
    expect(await Conversation.countDocuments()).toBe(1)
  })

  it('only the recipient can accept', async () => {
    const { aman, id } = await pending()
    const res = await aman.agent.post(`/api/friends/requests/${id}/accept`)
    expect(res.status).toBe(404)
  })

  it('a double accept only accepts once', async () => {
    const { priya, id } = await pending()

    const [first, second] = await Promise.all([
      priya.agent.post(`/api/friends/requests/${id}/accept`),
      priya.agent.post(`/api/friends/requests/${id}/accept`),
    ])

    expect([first.status, second.status].sort()).toEqual([200, 404])
    expect(await Conversation.countDocuments()).toBe(1)
  })

  it('returns 400 for an invalid id', async () => {
    const { priya } = await pending()
    const res = await priya.agent.post('/api/friends/requests/not-an-id/accept')
    expect(res.status).toBe(400)
  })

  it('decline returns 204 and only the recipient can decline', async () => {
    const { aman, priya, id } = await pending()

    expect((await aman.agent.post(`/api/friends/requests/${id}/decline`)).status).toBe(404)
    expect((await priya.agent.post(`/api/friends/requests/${id}/decline`)).status).toBe(204)
    expect((await Friendship.findOne()).status).toBe('declined')
  })

  it('cancel deletes the request, and only the requester can cancel', async () => {
    const { aman, priya, id } = await pending()

    expect((await priya.agent.delete(`/api/friends/requests/${id}`)).status).toBe(404)
    expect((await aman.agent.delete(`/api/friends/requests/${id}`)).status).toBe(204)
    expect(await Friendship.countDocuments()).toBe(0)
  })

  it('cannot cancel a request that was already accepted', async () => {
    const { aman, priya, id } = await pending()
    await priya.agent.post(`/api/friends/requests/${id}/accept`)

    expect((await aman.agent.delete(`/api/friends/requests/${id}`)).status).toBe(404)
  })
})

describe('GET /api/friends/requests', () => {
  it('lists incoming and outgoing separately', async () => {
    const aman = await registerUser('aman')
    await registerUser('priya')
    const rahul = await registerUser('rahul')
    await send(aman.agent, 'priya')
    await send(rahul.agent, 'aman')

    const res = await aman.agent.get('/api/friends/requests')

    expect(res.status).toBe(200)
    expect(res.body.outgoing.map((r) => r.user.username)).toEqual(['priya'])
    expect(res.body.incoming.map((r) => r.user.username)).toEqual(['rahul'])
    expect(res.body.incoming[0]).toEqual({
      id: expect.any(String),
      user: { id: expect.any(String), username: 'rahul', displayName: 'rahul', bio: '', avatarUrl: null },
      createdAt: expect.any(String),
    })
  })
})

describe('GET /api/friends and unfriend', () => {
  it('lists friends, most recent message first, no-message friends last', async () => {
    const { a: aman, conversationId: withPriya } = await makeFriends('aman', 'priya')
    const rahul = await registerUser('rahul')
    await send(aman.agent, 'rahul')
    const req = (await rahul.agent.get('/api/friends/requests')).body.incoming[0]
    await rahul.agent.post(`/api/friends/requests/${req.id}/accept`)
    await registerUser('sneha') // not a friend - must not appear

    await Conversation.updateOne(
      { _id: withPriya },
      { lastMessage: { text: 'hi', sender: aman.user.id, createdAt: new Date() } },
    )

    const res = await aman.agent.get('/api/friends')

    expect(res.status).toBe(200)
    expect(res.body.friends.map((f) => f.friend.username)).toEqual(['priya', 'rahul'])
    expect(res.body.friends[0].lastMessage).toEqual({
      text: 'hi',
      senderId: aman.user.id,
      createdAt: expect.any(String),
      attachment: null,
    })
  })

  it('never includes email or password hash of a friend', async () => {
    const { a } = await makeFriends('aman', 'priya')
    const res = await a.agent.get('/api/friends')
    const body = JSON.stringify(res.body)
    expect(body).not.toMatch(/email|passwordHash/)
  })

  it('unfriend deletes the friendship but keeps conversation and messages', async () => {
    const { a, b, conversationId } = await makeFriends('aman', 'priya')
    await Message.create({
      conversation: conversationId,
      sender: a.user.id,
      text: 'hello',
      clientId: crypto.randomUUID(),
    })

    const res = await a.agent.delete(`/api/friends/${b.user.id}`)

    expect(res.status).toBe(204)
    expect(await Friendship.countDocuments()).toBe(0)
    expect(await Conversation.countDocuments()).toBe(1)
    expect(await Message.countDocuments()).toBe(1)
    expect((await b.agent.get('/api/friends')).body.friends).toEqual([])
  })

  it('unfriend of someone who is not a friend returns 404', async () => {
    const aman = await registerUser('aman')
    const priya = await registerUser('priya')
    const res = await aman.agent.delete(`/api/friends/${priya.user.id}`)
    expect(res.status).toBe(404)
  })

  it('re-friending reuses the old conversation and its history', async () => {
    const { a, b, conversationId } = await makeFriends('aman', 'priya')
    await a.agent.delete(`/api/friends/${b.user.id}`)

    const sent = await send(a.agent, 'priya')
    const again = await b.agent.post(`/api/friends/requests/${sent.body.request.id}/accept`)

    expect(again.body.friend.conversationId).toBe(conversationId)
    expect(await Conversation.countDocuments()).toBe(1)
  })
})
