import request from 'supertest'

import app from '../src/app.js'
import { User } from '../src/models/User.js'

// A supertest "agent" keeps cookies between requests, like a browser tab.
// Returns the agent (already logged in), the user it registered, and the raw
// session cookie (for Socket.IO clients).
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

// The raw "token=..." cookie from a response, for Socket.IO clients.
export function sessionCookie(res) {
  const header = res.headers['set-cookie']?.find((c) => c.startsWith('token='))
  return header?.split(';')[0]
}

// Flips isAdmin on an already-registered user - the test equivalent of
// `npm run make-admin`, without going through a real admin panel action.
export async function makeAdmin(userId) {
  await User.findByIdAndUpdate(userId, { isAdmin: true })
}

// Registers two users and makes them friends. Returns both agents, both
// users and their shared conversation id.
export async function makeFriends(nameA, nameB) {
  const a = await registerUser(nameA)
  const b = await registerUser(nameB)

  const sent = await a.agent.post('/api/friends/requests').send({ username: nameB })
  const accepted = await b.agent.post(`/api/friends/requests/${sent.body.request.id}/accept`)

  return { a, b, conversationId: accepted.body.friend.conversationId }
}

// --- File fixtures -----------------------------------------------------------
// Only the first bytes ("magic numbers") matter to the server's type check,
// so most of these are a real signature followed by padding.

// A genuine 1x1 PNG (also used by the browser tests, where it must decode).
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

// --- Voice-note recordings, one per browser ---
// Only the parts the type check reads are real: the container's signature,
// then the codec / track-type text a recorder writes into its header.
const EBML = Buffer.from([0x1a, 0x45, 0xdf, 0xa3])
// Chrome / Edge: WebM with one Opus sound track.
export const WEBM_AUDIO = Buffer.concat([EBML, Buffer.alloc(32, 0), Buffer.from('A_OPUS'), Buffer.alloc(64, 7)])
// The same container carrying a picture too - must stay a video.
export const WEBM_VIDEO = Buffer.concat([EBML, Buffer.alloc(32, 0), Buffer.from('V_VP8'), Buffer.alloc(8, 0), Buffer.from('A_OPUS'), Buffer.alloc(64, 7)])
// Firefox: Ogg with Opus inside.
export const OGG_OPUS = Buffer.concat([Buffer.from('OggS'), Buffer.alloc(24, 0), Buffer.from('OpusHead'), Buffer.alloc(64, 7)])
// Safari: MP4 whose only track is sound ("hdlr" box, handler type "soun").
const hdlr = (type) => Buffer.concat([Buffer.from('hdlr'), Buffer.alloc(8, 0), Buffer.from(type), Buffer.alloc(12, 0)])
export const MP4_AUDIO = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypiso5'), Buffer.alloc(16, 0), hdlr('soun'), Buffer.alloc(64, 7)])
// An ordinary video: a picture track and a sound track.
export const MP4_VIDEO_TRACKS = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.alloc(16, 0), hdlr('vide'), hdlr('soun'), Buffer.alloc(64, 7)])
// An .m4a audio file ("M4A " brand).
export const M4A = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypM4A '), Buffer.alloc(64, 7)])

// A file of exactly `bytes` bytes that starts with a real signature.
export function sized(signature, bytes) {
  return Buffer.concat([signature, Buffer.alloc(bytes - signature.length, 0)])
}

// Uploads a file into a conversation as `agent`. `fields` are extra text
// fields sent with it (a voice note's durationMs / waveform).
export function upload(agent, conversationId, buffer, filename, fields = {}) {
  const req = agent.post(`/api/conversations/${conversationId}/attachments`)
  for (const [key, value] of Object.entries(fields)) req.field(key, value)
  return req.attach('file', buffer, filename)
}
