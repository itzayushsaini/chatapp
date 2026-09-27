import mongoose from 'mongoose'
import request from 'supertest'
import { describe, expect, it } from 'vitest'

import app from '../src/app.js'
import { Attachment } from '../src/models/Attachment.js'
import { deleteUnsentUploads } from '../src/services/attachmentService.js'
import { HTML, MP4, PDF, PNG, SVG, TEXT, ZIP, makeFriends, registerUser, sized, upload } from './helpers.js'

const MB = 1024 * 1024
const storedFiles = () => mongoose.connection.db.collection('uploads.files').countDocuments()

// Pretends a message has used this attachment. Sending itself happens over
// the socket and is tested in socket.test.js.
const markSent = (attachmentId) =>
  Attachment.updateOne({ _id: attachmentId }, { message: new mongoose.Types.ObjectId() })

describe('POST /api/conversations/:id/attachments', () => {
  it('uploads a photo and returns what the chat needs to show it', async () => {
    const { a, conversationId } = await makeFriends('aman', 'priya')

    const res = await upload(a.agent, conversationId, PNG, 'holiday.png')

    expect(res.status).toBe(201)
    expect(res.body.attachment).toEqual({
      id: expect.any(String),
      name: 'holiday.png',
      mimeType: 'image/png',
      size: PNG.length,
      kind: 'image',
      url: `/api/attachments/${res.body.attachment.id}`,
    })
  })

  it.each([
    ['a PDF', PDF, 'notes.pdf', 'application/pdf', 'file'],
    ['a Word document', ZIP, 'report.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'file'],
    ['a text file', TEXT, 'notes.txt', 'text/plain', 'file'],
    ['a video', MP4, 'clip.mp4', 'video/mp4', 'video'],
  ])('accepts %s', async (_label, bytes, name, mimeType, kind) => {
    const { a, conversationId } = await makeFriends('aman', 'priya')
    const res = await upload(a.agent, conversationId, bytes, name)

    expect(res.status).toBe(201)
    expect(res.body.attachment).toMatchObject({ mimeType, kind })
  })

  it('keeps non-English file names intact', async () => {
    const { a, conversationId } = await makeFriends('aman', 'priya')
    const res = await upload(a.agent, conversationId, PDF, 'रिपोर्ट.pdf')
    expect(res.body.attachment.name).toBe('रिपोर्ट.pdf')
  })

  it.each([
    ['an HTML page disguised as a photo', HTML, 'photo.jpg'],
    ['an SVG image (can contain scripts)', SVG, 'logo.svg'],
    ['a program', ZIP, 'setup.exe'],
  ])('refuses %s', async (_label, bytes, name) => {
    const { a, conversationId } = await makeFriends('aman', 'priya')

    const res = await upload(a.agent, conversationId, bytes, name)

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ message: 'This file type is not supported' })
    expect(await storedFiles()).toBe(0)
  })

  it('limits photos and documents to 10 MB', async () => {
    const { a, conversationId } = await makeFriends('aman', 'priya')
    const res = await upload(a.agent, conversationId, sized(PNG.subarray(0, 8), 10 * MB + 1), 'big.png')

    expect(res.status).toBe(413)
    expect(await storedFiles()).toBe(0)
  })

  it('allows videos up to 25 MB, but not more', async () => {
    const { a, conversationId } = await makeFriends('aman', 'priya')

    const ok = await upload(a.agent, conversationId, sized(MP4, 12 * MB), 'ok.mp4')
    expect(ok.status).toBe(201)

    const tooBig = await upload(a.agent, conversationId, sized(MP4, 25 * MB + 1), 'huge.mp4')
    expect(tooBig.status).toBe(413)
  })

  it('returns 404 to someone outside the conversation and stores nothing', async () => {
    const { conversationId } = await makeFriends('aman', 'priya')
    const outsider = await registerUser('rahul')

    const res = await upload(outsider.agent, conversationId, PNG, 'x.png')

    expect(res.status).toBe(404)
    expect(await storedFiles()).toBe(0)
  })

  it('returns 403 once they are no longer friends', async () => {
    const { a, b, conversationId } = await makeFriends('aman', 'priya')
    await a.agent.delete(`/api/friends/${b.user.id}`)

    const res = await upload(a.agent, conversationId, PNG, 'x.png')
    expect(res.status).toBe(403)
  })

  it('returns 400 when no file is sent', async () => {
    const { a, conversationId } = await makeFriends('aman', 'priya')
    const res = await a.agent.post(`/api/conversations/${conversationId}/attachments`)
    expect(res.status).toBe(400)
  })

  it('requires login', async () => {
    const { conversationId } = await makeFriends('aman', 'priya')
    const res = await upload(request(app), conversationId, PNG, 'x.png')
    expect(res.status).toBe(401)
  })
})

describe('GET /api/attachments/:id', () => {
  async function sentFile(bytes = PNG, name = 'photo.png') {
    const friends = await makeFriends('aman', 'priya')
    const res = await upload(friends.a.agent, friends.conversationId, bytes, name)
    await markSent(res.body.attachment.id)
    return { ...friends, attachment: res.body.attachment }
  }

  it('both people in the chat can download it, byte for byte', async () => {
    const { a, b, attachment } = await sentFile()

    for (const agent of [a.agent, b.agent]) {
      const res = await agent.get(attachment.url).buffer(true)
      expect(res.status).toBe(200)
      expect(Buffer.compare(res.body, PNG)).toBe(0)
    }
  })

  it('shows photos inline but always downloads documents', async () => {
    const { a, b, conversationId, attachment: photo } = await sentFile(PNG, 'photo.png')
    const inline = await b.agent.get(photo.url)
    expect(inline.headers['content-type']).toBe('image/png')
    expect(inline.headers['content-disposition']).toBe('inline')

    const { body } = await upload(a.agent, conversationId, PDF, 'notes.pdf')
    await markSent(body.attachment.id)
    const download = await b.agent.get(body.attachment.url)
    expect(download.headers['content-disposition']).toMatch(/^attachment; filename="notes.pdf"/)
  })

  it('sends the detected type, never one guessed from the name', async () => {
    const { b, attachment } = await sentFile(PDF, 'evil.html')

    const res = await b.agent.get(attachment.url)

    expect(res.headers['content-type']).toBe('application/pdf')
    expect(res.headers['content-disposition']).toMatch(/^attachment/)
  })

  it('returns 404 to an outsider, even for a sent file', async () => {
    const { attachment } = await sentFile()
    const outsider = await registerUser('rahul')

    const res = await outsider.agent.get(attachment.url)
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ message: 'File not found' })
  })

  it('an upload not sent yet is visible only to the uploader', async () => {
    const { a, b, conversationId } = await makeFriends('aman', 'priya')
    const { body } = await upload(a.agent, conversationId, PNG, 'draft.png')

    expect((await a.agent.get(body.attachment.url)).status).toBe(200)
    expect((await b.agent.get(body.attachment.url)).status).toBe(404)
  })

  it('serves byte ranges, which video seeking needs', async () => {
    const { b, attachment } = await sentFile(MP4, 'clip.mp4')

    const res = await b.agent.get(attachment.url).set('Range', 'bytes=4-11').buffer(true)

    expect(res.status).toBe(206)
    expect(res.headers['content-range']).toBe(`bytes 4-11/${MP4.length}`)
    expect(res.body.toString('latin1')).toBe('ftypisom')
  })

  it('answers 416 for a range past the end', async () => {
    const { b, attachment } = await sentFile()

    const res = await b.agent.get(attachment.url).set('Range', `bytes=${PNG.length}-`)

    expect(res.status).toBe(416)
    expect(res.headers['content-range']).toBe(`bytes */${PNG.length}`)
  })

  it('returns 400 for a malformed id and 404 for an unknown one', async () => {
    const { a } = await makeFriends('aman', 'priya')
    expect((await a.agent.get('/api/attachments/nope')).status).toBe(400)
    expect((await a.agent.get('/api/attachments/507f1f77bcf86cd799439011')).status).toBe(404)
  })
})

describe('cleaning up uploads that were never sent', () => {
  it('deletes unsent uploads and their bytes, and keeps sent ones', async () => {
    const { a, conversationId } = await makeFriends('aman', 'priya')
    const sent = await upload(a.agent, conversationId, PNG, 'sent.png')
    await upload(a.agent, conversationId, PNG, 'abandoned.png')
    await markSent(sent.body.attachment.id)

    const deleted = await deleteUnsentUploads(0)

    expect(deleted).toBe(1)
    expect(await Attachment.countDocuments()).toBe(1)
    expect(await storedFiles()).toBe(1)
    expect((await a.agent.get(sent.body.attachment.url)).status).toBe(200)
  })

  it('leaves recent unsent uploads alone (the user may still press Send)', async () => {
    const { a, conversationId } = await makeFriends('aman', 'priya')
    await upload(a.agent, conversationId, PNG, 'just-picked.png')

    expect(await deleteUnsentUploads()).toBe(0) // default: older than 1 hour
  })
})
