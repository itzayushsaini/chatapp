import request from 'supertest'

import app from '../src/app.js'
import { User } from '../src/models/User.js'

// the agent keeps cookies like a browser tab; the raw cookie is for Socket.IO clients
export async function registerUser(username, overrides = {}) {
  const agent = request.agent(app)
  const res = await agent.post('/api/auth/register').send({
    username,
    displayName: overrides.displayName ?? username,
    email: overrides.email ?? `${username}@gmail.com`,
    password: overrides.password ?? 'password123',
  })
  if (res.status !== 201) throw new Error(`register ${username} failed: ${res.status}`)
  return { agent, user: res.body.user, cookie: sessionCookie(res) }
}

export function sessionCookie(res) {
  const header = res.headers['set-cookie']?.find((c) => c.startsWith('token='))
  return header?.split(';')[0]
}

export async function makeAdmin(userId) {
  await User.findByIdAndUpdate(userId, { isAdmin: true })
}

export async function makeFriends(nameA, nameB) {
  const a = await registerUser(nameA)
  const b = await registerUser(nameB)

  const sent = await a.agent.post('/api/friends/requests').send({ username: nameB })
  const accepted = await b.agent.post(`/api/friends/requests/${sent.body.request.id}/accept`)

  return { a, b, conversationId: accepted.body.friend.conversationId }
}

// only the first bytes (magic numbers) matter to the type check, so most fixtures are a signature plus padding
export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
)
export const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)])
export const PDF = Buffer.from('%PDF-1.7\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n')
export const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.alloc(64, 2)])
export const ZIP = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(64, 3)])
export const TEXT = Buffer.from('Meeting notes\nशुक्रवार 5 बजे\n')
export const HTML = Buffer.from('<html><body><script>alert(document.cookie)</script></body></html>')
export const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')

// voice notes as Chrome (WebM), Firefox (Ogg) and Safari (MP4) record them: only the signature and track/codec text are real
const EBML = Buffer.from([0x1a, 0x45, 0xdf, 0xa3])
export const WEBM_AUDIO = Buffer.concat([EBML, Buffer.alloc(32, 0), Buffer.from('A_OPUS'), Buffer.alloc(64, 7)])
export const WEBM_VIDEO = Buffer.concat([EBML, Buffer.alloc(32, 0), Buffer.from('V_VP8'), Buffer.alloc(8, 0), Buffer.from('A_OPUS'), Buffer.alloc(64, 7)])
export const OGG_OPUS = Buffer.concat([Buffer.from('OggS'), Buffer.alloc(24, 0), Buffer.from('OpusHead'), Buffer.alloc(64, 7)])
const hdlr = (type) => Buffer.concat([Buffer.from('hdlr'), Buffer.alloc(8, 0), Buffer.from(type), Buffer.alloc(12, 0)])
export const MP4_AUDIO = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypiso5'), Buffer.alloc(16, 0), hdlr('soun'), Buffer.alloc(64, 7)])
export const MP4_VIDEO_TRACKS = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.alloc(16, 0), hdlr('vide'), hdlr('soun'), Buffer.alloc(64, 7)])
export const M4A = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypM4A '), Buffer.alloc(64, 7)])

export function sized(signature, bytes) {
  return Buffer.concat([signature, Buffer.alloc(bytes - signature.length, 0)])
}

export function upload(agent, conversationId, buffer, filename, fields = {}) {
  const req = agent.post(`/api/conversations/${conversationId}/attachments`)
  for (const [key, value] of Object.entries(fields)) req.field(key, value)
  return req.attach('file', buffer, filename)
}
