import http from 'node:http'

import { io as connectClient } from 'socket.io-client'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import app from '../src/app.js'
import { AiMessage } from '../src/models/AiMessage.js'
import { Attachment } from '../src/models/Attachment.js'
import { Message } from '../src/models/Message.js'
import { recoverInterrupted } from '../src/services/aiService.js'
import { AiError, createImage, isConfigured, streamReply } from '../src/services/geminiClient.js'
import { updateSettings } from '../src/services/settingsService.js'
import { getFileInfo } from '../src/services/storageService.js'
import { initSocket } from '../src/socket/index.js'
import {
  HTML,
  PDF,
  PNG,
  TEXT,
  WEBM_AUDIO,
  ZIP,
  makeAdmin,
  makeFriends,
  registerUser,
  sized,
  upload,
} from './helpers.js'

// geminiClient.js is the only file that talks to Google, so replacing it
// with a fake tests everything else for real - and no test ever sends a
// request to Gemini. AiError stays the real class.
vi.mock('../src/services/geminiClient.js', async (importOriginal) => ({
  ...(await importOriginal()),
  isConfigured: vi.fn(),
  streamReply: vi.fn(),
  createImage: vi.fn(),
}))

// A normal, successful answer, arriving in two pieces.
async function fakeAnswer({ onUpdate }) {
  onUpdate({ text: 'Hello', reasoning: 'The user said hi.' })
  onUpdate({ text: 'Hello there! **How can I help?**', reasoning: 'The user said hi.' })
  return { text: 'Hello there! **How can I help?**', reasoning: 'The user said hi.', truncated: false }
}

beforeEach(() => {
  vi.mocked(isConfigured).mockReset().mockReturnValue(true)
  vi.mocked(streamReply).mockReset().mockImplementation(fakeAnswer)
  vi.mocked(createImage).mockReset()
})

const ask = (agent, text, extra = {}) =>
  agent.post('/api/ai/messages').send({ text, clientId: crypto.randomUUID(), ...extra })

function askWithFile(agent, buffer, filename, fields = {}) {
  const req = agent.post('/api/ai/messages').field('clientId', crypto.randomUUID())
  for (const [key, value] of Object.entries(fields)) req.field(key, value)
  return req.attach('file', buffer, filename)
}

// The answer is written in the background, after the 202 - wait for it.
async function waitForAnswer(agent) {
  for (let i = 0; i < 150; i++) {
    const res = await agent.get('/api/ai/messages')
    const last = res.body.messages.at(-1)
    if (last?.role === 'model' && last.status !== 'streaming') return last
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error('the answer never finished')
}

// What the fake Gemini was asked last time.
const lastRequest = () => vi.mocked(streamReply).mock.calls.at(-1)[0]

// A promise the test resolves by hand - an answer that takes as long as the
// test wants it to.
function deferred() {
  let resolve
  const promise = new Promise((r) => (resolve = r))
  return { promise, resolve }
}

describe('PingMe AI: availability', () => {
  it('needs a login', async () => {
    const request = (await import('supertest')).default
    expect((await request(app).get('/api/ai/summary')).status).toBe(401)
    expect((await request(app).post('/api/ai/messages').send({ text: 'hi' })).status).toBe(401)
  })

  it('reports available, my limit and nothing used yet', async () => {
    const { agent } = await registerUser('riya')
    const res = await agent.get('/api/ai/summary')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ available: true, imageGeneration: false, dailyLimit: 50, usedToday: 0, latest: null })
  })

  it('is not available without an API key, and refuses questions (503)', async () => {
    vi.mocked(isConfigured).mockReturnValue(false)
    const { agent } = await registerUser('riya')
    expect((await agent.get('/api/ai/summary')).body.available).toBe(false)
    const res = await ask(agent, 'hi')
    expect(res.status).toBe(503)
    expect(streamReply).not.toHaveBeenCalled()
  })

  it('is not available when an admin switches it off', async () => {
    const { agent } = await registerUser('riya')
    await updateSettings({ aiEnabled: false })
    expect((await agent.get('/api/ai/summary')).body.available).toBe(false)
    expect((await ask(agent, 'hi')).status).toBe(503)
  })
})

describe('PingMe AI: asking', () => {
  it('saves the question and an empty answer at once (202), then writes the answer', async () => {
    const { agent } = await registerUser('riya')
    const res = await ask(agent, '  Hi PingMe AI  ')

    expect(res.status).toBe(202)
    expect(res.body.question).toMatchObject({ role: 'user', text: 'Hi PingMe AI', mode: 'chat', status: 'done' })
    expect(res.body.answer).toMatchObject({ role: 'model', text: '', status: 'streaming' })

    const answer = await waitForAnswer(agent)
    expect(answer).toMatchObject({
      id: res.body.answer.id,
      status: 'done',
      text: 'Hello there! **How can I help?**',
      reasoning: 'The user said hi.',
    })

    const { contents, systemInstruction, thinkDeeper } = lastRequest()
    expect(contents).toEqual([{ role: 'user', parts: [{ text: 'Hi PingMe AI' }] }])
    expect(systemInstruction).toContain('You are PingMe AI')
    expect(thinkDeeper).toBe(false)
  })

  it('remembers the conversation: the next question carries the earlier ones', async () => {
    const { agent } = await registerUser('riya')
    await ask(agent, 'My name is Riya')
    await waitForAnswer(agent)
    await ask(agent, 'What is my name?')
    await waitForAnswer(agent)

    expect(lastRequest().contents).toEqual([
      { role: 'user', parts: [{ text: 'My name is Riya' }] },
      { role: 'model', parts: [{ text: 'Hello there! **How can I help?**' }] },
      { role: 'user', parts: [{ text: 'What is my name?' }] },
    ])
  })

  it('sends only the last 20 messages, always starting with a question', async () => {
    const { agent, user } = await registerUser('riya')
    const old = []
    for (let i = 0; i < 12; i++) {
      old.push({ user: user.id, role: 'user', text: `question ${i}`, clientId: crypto.randomUUID() })
      old.push({ user: user.id, role: 'model', text: `answer ${i}` })
    }
    await AiMessage.insertMany(old)
    await ask(agent, 'newest')
    await waitForAnswer(agent)

    const { contents } = lastRequest()
    expect(contents).toHaveLength(19) // 20 back, minus a leading answer
    expect(contents[0]).toEqual({ role: 'user', parts: [{ text: 'question 3' }] })
    expect(contents.at(-1)).toEqual({ role: 'user', parts: [{ text: 'newest' }] })
  })

  it('"Think deeper" asks Gemini to reason harder', async () => {
    const { agent } = await registerUser('riya')
    const res = await ask(agent, 'Plan my exam week', { mode: 'think' })
    expect(res.body.question.mode).toBe('think')
    await waitForAnswer(agent)
    expect(lastRequest().thinkDeeper).toBe(true)
  })

  it('a cut-off answer is kept, with a note that it was cut short', async () => {
    vi.mocked(streamReply).mockResolvedValueOnce({ text: 'A long answer', reasoning: '', truncated: true })
    const { agent } = await registerUser('riya')
    await ask(agent, 'Write a lot')
    expect((await waitForAnswer(agent)).text).toMatch(/^A long answer\n\n\*\(The answer was cut short/)
  })

  it('validates the question', async () => {
    const { agent } = await registerUser('riya')
    expect((await ask(agent, '   ')).status).toBe(400)
    expect((await ask(agent, 'x'.repeat(4001))).status).toBe(400)
    expect((await ask(agent, 'hi', { clientId: 'not-a-uuid' })).status).toBe(400)
    expect((await ask(agent, 'hi', { mode: 'telepathy' })).status).toBe(400)
    expect((await ask(agent, { $gt: '' })).status).toBe(400)
    expect(streamReply).not.toHaveBeenCalled()
  })

  it('sending the same clientId twice saves and answers it only once', async () => {
    const { agent } = await registerUser('riya')
    const clientId = crypto.randomUUID()
    const first = await ask(agent, 'hi', { clientId })
    await waitForAnswer(agent)
    const again = await ask(agent, 'hi', { clientId })

    expect(again.status).toBe(202)
    expect(again.body.question.id).toBe(first.body.question.id)
    expect(again.body.answer.id).toBe(first.body.answer.id)
    expect(streamReply).toHaveBeenCalledTimes(1)
    expect(await AiMessage.countDocuments()).toBe(2)
  })

  it('only one answer at a time: asking again while it is still answering is 409', async () => {
    const slow = deferred()
    vi.mocked(streamReply).mockImplementationOnce(() => slow.promise)
    const { agent } = await registerUser('riya')

    expect((await ask(agent, 'first')).status).toBe(202)
    const second = await ask(agent, 'second')
    expect(second.status).toBe(409)
    expect(second.body.message).toMatch(/still answering/)

    slow.resolve({ text: 'done', reasoning: '', truncated: false })
    await waitForAnswer(agent)
    expect((await ask(agent, 'third')).status).toBe(202)
  })

  it('history is paged with before/limit, oldest first', async () => {
    const { agent } = await registerUser('riya')
    for (const text of ['one', 'two']) {
      await ask(agent, text)
      await waitForAnswer(agent)
    }
    const page = await agent.get('/api/ai/messages?limit=2')
    expect(page.body.messages.map((m) => m.role)).toEqual(['user', 'model'])
    expect(page.body.messages[0].text).toBe('two')
    expect(page.body.hasMore).toBe(true)

    const older = await agent.get(`/api/ai/messages?limit=2&before=${page.body.messages[0].id}`)
    expect(older.body.messages[0].text).toBe('one')
    expect(older.body.hasMore).toBe(false)
  })

  it('each person only ever sees their own chat with PingMe AI', async () => {
    const riya = await registerUser('riya')
    const aman = await registerUser('aman')
    await ask(riya.agent, 'my secret question')
    await waitForAnswer(riya.agent)

    expect((await aman.agent.get('/api/ai/messages')).body.messages).toEqual([])
    expect((await aman.agent.get('/api/ai/summary')).body.latest).toBeNull()
  })
})

describe('PingMe AI: files', () => {
  it('a photo is sent to Gemini as its real bytes, and only its owner can download it', async () => {
    const { agent } = await registerUser('riya')
    const res = await askWithFile(agent, PNG, 'photo.png', { text: 'What is in this photo?' })
    expect(res.status).toBe(202)
    expect(res.body.question.attachment).toMatchObject({
      name: 'photo.png',
      mimeType: 'image/png',
      kind: 'image',
      url: `/api/ai/files/${res.body.question.id}`,
    })
    await waitForAnswer(agent)

    expect(lastRequest().contents.at(-1).parts).toEqual([
      { inlineData: { mimeType: 'image/png', data: PNG.toString('base64') } },
      { text: 'What is in this photo?' },
    ])

    const download = await agent.get(res.body.question.attachment.url)
    expect(download.status).toBe(200)
    expect(download.headers['content-type']).toBe('image/png')
    expect(download.headers['content-disposition']).toBe('inline')

    const stranger = await registerUser('aman')
    expect((await stranger.agent.get(res.body.question.attachment.url)).status).toBe(404)
  })

  it('a voice note on its own is a question too, with its length and waveform', async () => {
    const { agent } = await registerUser('riya')
    const res = await askWithFile(agent, WEBM_AUDIO, 'voice.webm', { durationMs: '2300', waveform: '[10,80,40]' })
    expect(res.status).toBe(202)
    expect(res.body.question.attachment).toMatchObject({ kind: 'audio', mimeType: 'audio/webm', durationMs: 2300, waveform: [10, 80, 40] })
    await waitForAnswer(agent)
    expect(lastRequest().contents.at(-1).parts[0].inlineData.mimeType).toBe('audio/webm')
  })

  it('PDFs and text files can be read; documents download rather than open', async () => {
    const { agent } = await registerUser('riya')
    const pdf = await askWithFile(agent, PDF, 'notes.pdf', { text: 'Summarise this' })
    expect(pdf.status).toBe(202)
    await waitForAnswer(agent)
    const download = await agent.get(pdf.body.question.attachment.url)
    expect(download.headers['content-disposition']).toMatch(/^attachment/)

    expect((await askWithFile(agent, TEXT, 'notes.txt')).status).toBe(202)
  })

  it('refuses files Gemini cannot read, or anything unsafe', async () => {
    const { agent } = await registerUser('riya')
    const gif = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(32)])
    for (const [buffer, name] of [[gif, 'a.gif'], [ZIP, 'report.docx'], [HTML, 'page.html']]) {
      const res = await askWithFile(agent, buffer, name)
      expect(res.status).toBe(400)
      expect(res.body.message).toMatch(/PingMe AI can read/)
    }
    expect(await AiMessage.countDocuments()).toBe(0)
  })

  it('a file over 10 MB is refused (413)', async () => {
    const { agent } = await registerUser('riya')
    const res = await askWithFile(agent, sized(PNG, 10 * 1024 * 1024 + 1), 'big.png')
    expect(res.status).toBe(413)
  })

  it('only the newest 3 files go in as bytes - older ones are described instead', async () => {
    const { agent } = await registerUser('riya')
    for (let i = 0; i < 4; i++) {
      await askWithFile(agent, PNG, `photo${i}.png`, { text: `photo ${i}` })
      await waitForAnswer(agent)
    }
    const questions = lastRequest().contents.filter((c) => c.role === 'user')
    expect(questions[0].parts[0]).toEqual({ text: '[The user sent a photo here. It is no longer attached.]' })
    for (const later of questions.slice(1)) expect(later.parts[0].inlineData).toBeDefined()
  })
})

describe('PingMe AI: stop, errors and retry', () => {
  it('Stop keeps whatever had arrived so far', async () => {
    vi.mocked(streamReply).mockImplementationOnce(
      ({ onUpdate, signal }) =>
        new Promise((resolve, reject) => {
          onUpdate({ text: 'The first part', reasoning: '' })
          signal.addEventListener('abort', () => reject(new Error('aborted')))
        }),
    )
    const { agent } = await registerUser('riya')
    await ask(agent, 'Tell me a long story')
    await new Promise((resolve) => setTimeout(resolve, 30))

    expect((await agent.post('/api/ai/stop')).status).toBe(204)
    const answer = await waitForAnswer(agent)
    expect(answer).toMatchObject({ status: 'stopped', text: 'The first part' })
    // Stopping again (nothing running) is harmless.
    expect((await agent.post('/api/ai/stop')).status).toBe(204)
  })

  it.each([
    ['busy', /busy right now/],
    ['blocked', /can't help with that/],
    ['config', /isn't set up correctly/],
    ['bad_request', /couldn't read that/],
    ['empty', /didn't come up with an answer/],
  ])('a Gemini failure (%s) becomes a readable error on the answer', async (reason, message) => {
    vi.mocked(streamReply).mockRejectedValueOnce(new AiError(reason))
    const { agent } = await registerUser('riya')
    await ask(agent, 'hi')
    const answer = await waitForAnswer(agent)
    expect(answer.status).toBe('error')
    expect(answer.error).toMatch(message)
    expect(answer.text).toBe('')
  })

  it('a bug in our own code is logged, and the user still gets a readable error', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(streamReply).mockRejectedValueOnce(new TypeError('oops'))
    const { agent } = await registerUser('riya')
    await ask(agent, 'hi')
    expect((await waitForAnswer(agent)).error).toMatch(/Something went wrong/)
    expect(log).toHaveBeenCalled()
    log.mockRestore()
  })

  it('"Try again" answers the same question again, into the same answer', async () => {
    vi.mocked(streamReply).mockRejectedValueOnce(new AiError('busy'))
    const { agent } = await registerUser('riya')
    const asked = await ask(agent, 'hi')
    await waitForAnswer(agent)

    const res = await agent.post('/api/ai/retry')
    expect(res.status).toBe(202)
    expect(res.body.answer).toMatchObject({ id: asked.body.answer.id, status: 'streaming' })
    expect(await waitForAnswer(agent)).toMatchObject({ id: asked.body.answer.id, status: 'done' })
    expect(lastRequest().contents).toEqual([{ role: 'user', parts: [{ text: 'hi' }] }])
  })

  it('"Try again" with nothing failed is 400', async () => {
    const { agent } = await registerUser('riya')
    expect((await agent.post('/api/ai/retry')).status).toBe(400)
    await ask(agent, 'hi')
    await waitForAnswer(agent)
    expect((await agent.post('/api/ai/retry')).status).toBe(400)
  })

  it('an answer cut off by a server restart is marked failed at startup', async () => {
    const { user } = await registerUser('riya')
    const answer = await AiMessage.create({ user: user.id, role: 'model', status: 'streaming', text: 'half' })
    expect(await recoverInterrupted()).toBe(1)
    expect(await AiMessage.findById(answer._id)).toMatchObject({ status: 'error', error: expect.stringMatching(/interrupted/) })
  })
})

describe('PingMe AI: the daily limit', () => {
  it('stops at the admin-set number of answers per 24 hours (429)', async () => {
    await updateSettings({ aiDailyLimit: 2 })
    const { agent } = await registerUser('riya')
    for (const text of ['one', 'two']) {
      expect((await ask(agent, text)).status).toBe(202)
      await waitForAnswer(agent)
    }
    const res = await ask(agent, 'three')
    expect(res.status).toBe(429)
    expect(res.body.message).toMatch(/today's 2 PingMe AI messages/)
    expect((await agent.get('/api/ai/summary')).body.usedToday).toBe(2)
  })

  it('failed answers do not use up the limit', async () => {
    await updateSettings({ aiDailyLimit: 1 })
    vi.mocked(streamReply).mockRejectedValueOnce(new AiError('busy'))
    const { agent } = await registerUser('riya')
    await ask(agent, 'one')
    await waitForAnswer(agent)
    expect((await ask(agent, 'two')).status).toBe(202)
  })

  it('answers older than 24 hours no longer count', async () => {
    await updateSettings({ aiDailyLimit: 1 })
    const { agent, user } = await registerUser('riya')
    const yesterday = new Date(Date.now() - 25 * 60 * 60 * 1000)
    await AiMessage.collection.insertOne({ user: new AiMessage({ user: user.id }).user, role: 'model', status: 'done', text: 'old', createdAt: yesterday, updatedAt: yesterday })
    expect((await ask(agent, 'today')).status).toBe(202)
  })

  it('someone over the limit cannot even upload a file', async () => {
    await updateSettings({ aiDailyLimit: 1 })
    const { agent } = await registerUser('riya')
    await ask(agent, 'one')
    await waitForAnswer(agent)
    expect((await askWithFile(agent, PNG, 'photo.png')).status).toBe(429)
    expect(await AiMessage.countDocuments({ attachment: { $ne: null } })).toBe(0)
  })
})

describe('PingMe AI: clear chat', () => {
  it('deletes my messages and my files - but no one else’s', async () => {
    const riya = await registerUser('riya')
    const aman = await registerUser('aman')
    const photo = await askWithFile(riya.agent, PNG, 'photo.png')
    await waitForAnswer(riya.agent)
    await ask(aman.agent, 'hi')
    await waitForAnswer(aman.agent)

    const fileId = (await AiMessage.findById(photo.body.question.id)).attachment.fileId
    expect((await riya.agent.delete('/api/ai/messages')).status).toBe(204)

    expect((await riya.agent.get('/api/ai/messages')).body.messages).toEqual([])
    expect(await getFileInfo(fileId)).toBeNull()
    expect((await aman.agent.get('/api/ai/messages')).body.messages).toHaveLength(2)
  })
})

describe('PingMe AI: forwarding a message from a friend chat', () => {
  async function chatMessage(conversationId, senderId, { text = '', attachmentId = null } = {}) {
    const message = await Message.create({
      conversation: conversationId,
      sender: senderId,
      text,
      clientId: crypto.randomUUID(),
      attachment: attachmentId,
    })
    if (attachmentId) await Attachment.updateOne({ _id: attachmentId }, { message: message._id })
    return message
  }

  const forward = (agent, messageId) =>
    agent.post('/api/ai/forward').send({ messageId: String(messageId), clientId: crypto.randomUUID() })

  it('forwards a text message as a question, telling Gemini it was forwarded', async () => {
    const { a, b, conversationId } = await makeFriends('riya', 'aman')
    const message = await chatMessage(conversationId, b.user.id, { text: 'Is the exam on Friday?' })

    const res = await forward(a.agent, message._id)
    expect(res.status).toBe(202)
    expect(res.body.question).toMatchObject({ text: 'Is the exam on Friday?', forwarded: true })
    await waitForAnswer(a.agent)
    expect(lastRequest().contents.at(-1).parts).toEqual([
      { text: '(The user forwarded this message to you from one of their chats.)' },
      { text: 'Is the exam on Friday?' },
    ])
  })

  it("forwards a photo without copying it - clearing the AI chat leaves the chat's photo alone", async () => {
    const { a, b, conversationId } = await makeFriends('riya', 'aman')
    const uploaded = await upload(b.agent, conversationId, PNG, 'trip.png')
    const message = await chatMessage(conversationId, b.user.id, { attachmentId: uploaded.body.attachment.id })

    const res = await forward(a.agent, message._id)
    expect(res.status).toBe(202)
    expect(res.body.question.attachment).toMatchObject({ kind: 'image', name: 'trip.png' })
    await waitForAnswer(a.agent)
    expect((await a.agent.get(res.body.question.attachment.url)).status).toBe(200)

    await a.agent.delete('/api/ai/messages')
    const chatFile = await Attachment.findById(uploaded.body.attachment.id)
    expect(await getFileInfo(chatFile.fileId)).not.toBeNull()
    expect((await b.agent.get(`/api/attachments/${chatFile._id}`)).status).toBe(200)
  })

  it('refuses a message from a chat I am not in (404), and deleted messages (400)', async () => {
    const { b, conversationId } = await makeFriends('riya', 'aman')
    const outsider = await registerUser('kabir')
    const message = await chatMessage(conversationId, b.user.id, { text: 'private' })
    expect((await forward(outsider.agent, message._id)).status).toBe(404)

    await Message.updateOne({ _id: message._id }, { deletedForEveryone: true })
    expect((await forward(b.agent, message._id)).status).toBe(400)
  })

  it('refuses a file PingMe AI cannot read, and respects the admin forwarding switch', async () => {
    const { a, b, conversationId } = await makeFriends('riya', 'aman')
    const zip = await upload(b.agent, conversationId, ZIP, 'project.zip')
    const message = await chatMessage(conversationId, b.user.id, { attachmentId: zip.body.attachment.id })
    expect((await forward(a.agent, message._id)).status).toBe(400)

    const text = await chatMessage(conversationId, b.user.id, { text: 'hi' })
    await updateSettings({ forwardingEnabled: false })
    expect((await forward(a.agent, text._id)).status).toBe(403)
  })
})

describe('PingMe AI: creating pictures ("Imagine")', () => {
  it('is refused while the admin switch is off (the default)', async () => {
    const { agent } = await registerUser('riya')
    const res = await ask(agent, 'a cat in space', { mode: 'imagine' })
    expect(res.status).toBe(403)
    expect((await agent.get('/api/ai/summary')).body.imageGeneration).toBe(false)
  })

  it('when switched on, saves the created picture as the answer', async () => {
    await updateSettings({ aiImageGenerationEnabled: true })
    vi.mocked(createImage).mockResolvedValueOnce({ text: 'Here is your cat!', image: { buffer: PNG, mimeType: 'image/png' } })
    const { agent } = await registerUser('riya')

    expect((await ask(agent, 'a cat in space', { mode: 'imagine' })).status).toBe(202)
    const answer = await waitForAnswer(agent)
    expect(answer).toMatchObject({ status: 'done', mode: 'imagine', text: 'Here is your cat!' })
    expect(answer.attachment).toMatchObject({ kind: 'image', mimeType: 'image/png' })
    expect(createImage).toHaveBeenCalledWith(expect.objectContaining({ prompt: 'a cat in space', image: null }))

    const picture = await agent.get(answer.attachment.url)
    expect(picture.status).toBe(200)
    expect(picture.headers['content-type']).toBe('image/png')
  })

  it('can change a photo I attach, and needs a description', async () => {
    await updateSettings({ aiImageGenerationEnabled: true })
    vi.mocked(createImage).mockResolvedValueOnce({ text: '', image: { buffer: PNG, mimeType: 'image/png' } })
    const { agent } = await registerUser('riya')

    expect((await askWithFile(agent, PNG, 'me.png', { mode: 'imagine' })).status).toBe(400)
    expect((await askWithFile(agent, PDF, 'a.pdf', { mode: 'imagine', text: 'make it blue' })).status).toBe(400)

    await askWithFile(agent, PNG, 'me.png', { mode: 'imagine', text: 'make it a cartoon' })
    await waitForAnswer(agent)
    const { image } = vi.mocked(createImage).mock.calls[0][0]
    expect(image.buffer.equals(PNG)).toBe(true)
  })

  it('a free Gemini plan (no image quota) gives a clear message', async () => {
    await updateSettings({ aiImageGenerationEnabled: true })
    vi.mocked(createImage).mockRejectedValueOnce(new AiError('unavailable'))
    const { agent } = await registerUser('riya')
    await ask(agent, 'a cat', { mode: 'imagine' })
    expect((await waitForAnswer(agent)).error).toMatch(/isn't available on this server's Gemini plan/)
  })
})

describe('PingMe AI: admin', () => {
  it('settings include the AI switches, validated', async () => {
    const { agent, user } = await registerUser('boss')
    await makeAdmin(user.id)

    const settings = await agent.get('/api/admin/settings')
    expect(settings.body.settings).toMatchObject({
      aiEnabled: true,
      aiDailyLimit: 50,
      aiImageGenerationEnabled: false,
      aiConfigured: true,
    })

    const changed = await agent.patch('/api/admin/settings').send({ aiDailyLimit: 10, aiImageGenerationEnabled: true })
    expect(changed.body.settings).toMatchObject({ aiDailyLimit: 10, aiImageGenerationEnabled: true })
    expect((await agent.patch('/api/admin/settings').send({ aiDailyLimit: 0 })).status).toBe(400)
    expect((await agent.patch('/api/admin/settings').send({ aiDailyLimit: 1001 })).status).toBe(400)
  })

  it("counts today's answers in the stats, and deleting an account deletes its AI chat", async () => {
    const admin = await registerUser('boss')
    await makeAdmin(admin.user.id)
    const riya = await registerUser('riya')
    await askWithFile(riya.agent, PNG, 'photo.png', { text: 'hi' })
    await waitForAnswer(riya.agent)

    expect((await admin.agent.get('/api/admin/stats')).body.aiAnswersToday).toBe(1)

    const fileId = (await AiMessage.findOne({ role: 'user' })).attachment.fileId
    expect((await admin.agent.delete(`/api/admin/users/${riya.user.id}`)).status).toBe(204)
    expect(await AiMessage.countDocuments()).toBe(0)
    expect(await getFileInfo(fileId)).toBeNull()
  })
})

describe('PingMe AI: live events', () => {
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
    const events = []
    socket.onAny((event, payload) => events.push([event, payload]))
    return new Promise((resolve, reject) => {
      socket.on('connect', () => resolve({ socket, events }))
      socket.on('connect_error', reject)
    })
  }

  it('the question, every piece of the answer and the end reach all my tabs - and nobody else', async () => {
    const riya = await registerUser('riya')
    const aman = await registerUser('aman')
    const tab = await connect(riya.cookie)
    const other = await connect(aman.cookie)

    const res = await ask(riya.agent, 'hi')
    await waitForAnswer(riya.agent)
    await new Promise((resolve) => setTimeout(resolve, 50))

    const mine = tab.events.filter(([event]) => event.startsWith('ai:'))
    expect(mine.map(([event]) => event)).toEqual(['ai:new', 'ai:delta', 'ai:delta', 'ai:done'])
    expect(mine[0][1].messages.map((m) => m.id)).toEqual([res.body.question.id, res.body.answer.id])
    // Each delta carries the WHOLE answer so far.
    expect(mine[1][1]).toEqual({ id: res.body.answer.id, text: 'Hello', reasoning: 'The user said hi.' })
    expect(mine[2][1].text).toBe('Hello there! **How can I help?**')
    expect(mine[3][1].message).toMatchObject({ id: res.body.answer.id, status: 'done' })

    await riya.agent.delete('/api/ai/messages')
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(tab.events.at(-1)).toEqual(['ai:cleared', {}])

    expect(other.events.filter(([event]) => event.startsWith('ai:'))).toEqual([])
    tab.socket.disconnect()
    other.socket.disconnect()
  })
})
