import { describe, expect, it } from 'vitest'

import { Attachment } from '../src/models/Attachment.js'
import { Block } from '../src/models/Block.js'
import { Conversation } from '../src/models/Conversation.js'
import { Friendship } from '../src/models/Friendship.js'
import { Message } from '../src/models/Message.js'
import { makeFriends, PNG, PDF, registerUser, upload } from './helpers.js'

// Messages are only ever SENT over the socket, so these tests insert them
// directly (see conversations.test.js for the same approach).
function insertMessage(conversationId, senderId, extra = {}) {
  return Message.create({
    conversation: conversationId,
    sender: senderId,
    text: 'hello',
    clientId: crypto.randomUUID(),
    ...extra,
  })
}

// An uploaded file that has been sent in a message.
async function sendFile(agent, conversationId, senderId, buffer, filename) {
  const up = await upload(agent, conversationId, buffer, filename)
  const message = await insertMessage(conversationId, senderId, { text: '', attachment: up.body.attachment.id })
  await Attachment.updateOne({ _id: up.body.attachment.id }, { message: message._id })
  return { message, attachmentId: up.body.attachment.id }
}

describe('blocking', () => {
  it('blocks a friend: the friendship ends, the chat is kept, and neither side can find the other', async () => {
    const { a, b, conversationId } = await makeFriends('aman', 'priya')

    const res = await a.agent.post(`/api/users/${b.user.id}/block`)
    expect(res.status).toBe(204)

    expect(await Friendship.countDocuments()).toBe(0)
    expect(await Conversation.exists({ _id: conversationId })).toBeTruthy()

    // Both directions look exactly like "no such user".
    const aSearch = await a.agent.get('/api/users/search?username=priya')
    const bSearch = await b.agent.get('/api/users/search?username=aman')
    expect(aSearch.status).toBe(404)
    expect(bSearch.status).toBe(404)
    expect(bSearch.body).toEqual({ message: 'No user found' })

    const bRequest = await b.agent.post('/api/friends/requests').send({ username: 'aman' })
    expect(bRequest.status).toBe(404)
  })

  it('blocking removes a pending request too', async () => {
    const a = await registerUser('aman')
    const b = await registerUser('priya')
    await a.agent.post('/api/friends/requests').send({ username: 'priya' })

    await b.agent.post(`/api/users/${a.user.id}/block`)

    const requests = await b.agent.get('/api/friends/requests')
    expect(requests.body.incoming).toEqual([])
  })

  it('lists who I blocked (PublicUser only), and unblocking makes them findable again', async () => {
    const a = await registerUser('aman')
    const b = await registerUser('priya')
    await a.agent.post(`/api/users/${b.user.id}/block`)

    const list = await a.agent.get('/api/users/me/blocked')
    expect(list.body.users).toEqual([
      { id: b.user.id, username: 'priya', displayName: 'priya', bio: '', avatarUrl: null },
    ])
    // Being blocked is not something the blocked person can see.
    const theirList = await b.agent.get('/api/users/me/blocked')
    expect(theirList.body.users).toEqual([])

    const unblock = await a.agent.delete(`/api/users/${b.user.id}/block`)
    expect(unblock.status).toBe(204)
    const search = await b.agent.get('/api/users/search?username=aman')
    expect(search.status).toBe(200)
    expect(search.body.relationship).toBe('none')
  })

  it('blocking twice is harmless', async () => {
    const a = await registerUser('aman')
    const b = await registerUser('priya')
    await a.agent.post(`/api/users/${b.user.id}/block`)
    const again = await a.agent.post(`/api/users/${b.user.id}/block`)
    expect(again.status).toBe(204)
    expect(await Block.countDocuments()).toBe(1)
  })

  it('rejects blocking myself, an unknown user, and a bad id', async () => {
    const a = await registerUser('aman')
    expect((await a.agent.post(`/api/users/${a.user.id}/block`)).status).toBe(400)
    expect((await a.agent.post('/api/users/64b000000000000000000000/block')).status).toBe(404)
    expect((await a.agent.post('/api/users/not-an-id/block')).status).toBe(400)
  })
})

describe('POST /api/conversations/:id/clear', () => {
  it('empties the chat for me only - the other person keeps everything', async () => {
    const { a, b, conversationId } = await makeFriends('aman', 'priya')
    await insertMessage(conversationId, a.user.id)
    await insertMessage(conversationId, b.user.id)

    const res = await a.agent.post(`/api/conversations/${conversationId}/clear`)
    expect(res.status).toBe(204)

    const mine = await a.agent.get(`/api/conversations/${conversationId}/messages`)
    const theirs = await b.agent.get(`/api/conversations/${conversationId}/messages`)
    expect(mine.body.messages).toEqual([])
    expect(theirs.body.messages).toHaveLength(2)

    // New messages after the clear still show up.
    await insertMessage(conversationId, b.user.id, { text: 'after' })
    const later = await a.agent.get(`/api/conversations/${conversationId}/messages`)
    expect(later.body.messages.map((m) => m.text)).toEqual(['after'])
  })

  it('hides the Chats preview of a cleared message from me only', async () => {
    const { a, b, conversationId } = await makeFriends('aman', 'priya')
    const m = await insertMessage(conversationId, a.user.id, { text: 'secret' })
    await Conversation.updateOne(
      { _id: conversationId },
      { lastMessage: { messageId: m._id, text: 'secret', sender: a.user.id, createdAt: m.createdAt } },
    )

    await a.agent.post(`/api/conversations/${conversationId}/clear`)

    const mine = await a.agent.get('/api/friends')
    const theirs = await b.agent.get('/api/friends')
    expect(mine.body.friends[0].lastMessage).toBeNull()
    expect(theirs.body.friends[0].lastMessage.text).toBe('secret')
  })

  it('is 404 for someone outside the conversation', async () => {
    const { conversationId } = await makeFriends('aman', 'priya')
    const stranger = await registerUser('rahul')
    const res = await stranger.agent.post(`/api/conversations/${conversationId}/clear`)
    expect(res.status).toBe(404)
  })
})

describe('PATCH /api/conversations/:id/mute', () => {
  it('mutes and unmutes for me only, shown in my Chats list', async () => {
    const { a, b, conversationId } = await makeFriends('aman', 'priya')

    const muted = await a.agent.patch(`/api/conversations/${conversationId}/mute`).send({ muted: true })
    expect(muted.status).toBe(200)
    expect(muted.body).toEqual({ muted: true })

    expect((await a.agent.get('/api/friends')).body.friends[0].muted).toBe(true)
    expect((await b.agent.get('/api/friends')).body.friends[0].muted).toBe(false)

    await a.agent.patch(`/api/conversations/${conversationId}/mute`).send({ muted: false })
    expect((await a.agent.get('/api/friends')).body.friends[0].muted).toBe(false)
  })

  it('rejects a non-boolean, and a stranger gets 404', async () => {
    const { a, conversationId } = await makeFriends('aman', 'priya')
    const bad = await a.agent.patch(`/api/conversations/${conversationId}/mute`).send({ muted: 'yes' })
    expect(bad.status).toBe(400)

    const stranger = await registerUser('rahul')
    const res = await stranger.agent.patch(`/api/conversations/${conversationId}/mute`).send({ muted: true })
    expect(res.status).toBe(404)
  })
})

describe('GET /api/conversations/:id/attachments', () => {
  it('lists the files sent in the chat, newest first, without unsent or deleted ones', async () => {
    const { a, b, conversationId } = await makeFriends('aman', 'priya')
    const photo = await sendFile(a.agent, conversationId, a.user.id, PNG, 'photo.png')
    const doc = await sendFile(b.agent, conversationId, b.user.id, PDF, 'notes.pdf')
    const gone = await sendFile(a.agent, conversationId, a.user.id, PNG, 'gone.png')
    await Message.updateOne({ _id: gone.message._id }, { deletedForEveryone: true })
    await upload(a.agent, conversationId, PNG, 'never-sent.png')
    await insertMessage(conversationId, a.user.id) // text only

    const res = await a.agent.get(`/api/conversations/${conversationId}/attachments`)
    expect(res.status).toBe(200)
    expect(res.body.items.map((i) => i.attachment.name)).toEqual(['notes.pdf', 'photo.png'])
    expect(res.body.items[0]).toMatchObject({
      messageId: String(doc.message._id),
      senderId: b.user.id,
      attachment: { id: doc.attachmentId, kind: 'file', mimeType: 'application/pdf' },
    })
    expect(res.body.items[1].attachment.kind).toBe('image')
    expect(photo.attachmentId).toBe(res.body.items[1].attachment.id)
  })

  it('leaves out files I deleted for me', async () => {
    const { a, conversationId } = await makeFriends('aman', 'priya')
    const photo = await sendFile(a.agent, conversationId, a.user.id, PNG, 'photo.png')
    await Message.updateOne({ _id: photo.message._id }, { $addToSet: { deletedFor: a.user.id } })

    const res = await a.agent.get(`/api/conversations/${conversationId}/attachments`)
    expect(res.body.items).toEqual([])
  })

  it('is 404 for someone outside the conversation', async () => {
    const { conversationId } = await makeFriends('aman', 'priya')
    const stranger = await registerUser('rahul')
    const res = await stranger.agent.get(`/api/conversations/${conversationId}/attachments`)
    expect(res.status).toBe(404)
  })
})

describe('theme preference', () => {
  it('saves light / dark / system on my profile', async () => {
    const { agent } = await registerUser('aman')

    const res = await agent.patch('/api/users/me').send({ theme: 'dark' })
    expect(res.status).toBe(200)
    expect(res.body.user.theme).toBe('dark')
    expect((await agent.get('/api/auth/me')).body.user.theme).toBe('dark')

    const system = await agent.patch('/api/users/me').send({ theme: 'system' })
    expect(system.body.user.theme).toBe('system')
  })

  it('rejects an unknown theme', async () => {
    const { agent } = await registerUser('aman')
    const res = await agent.patch('/api/users/me').send({ theme: 'purple' })
    expect(res.status).toBe(400)
  })
})
