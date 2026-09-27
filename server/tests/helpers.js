import request from 'supertest'

import app from '../src/app.js'

// A supertest "agent" keeps cookies between requests, like a browser tab.
// Returns the agent (already logged in), the user it registered, and the raw
// session cookie (for Socket.IO clients).
export async function registerUser(username, overrides = {}) {
  const agent = request.agent(app)
  const res = await agent.post('/api/auth/register').send({
    username,
    displayName: overrides.displayName ?? username,
    email: overrides.email ?? `${username}@example.com`,
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

// A file of exactly `bytes` bytes that starts with a real signature.
export function sized(signature, bytes) {
  return Buffer.concat([signature, Buffer.alloc(bytes - signature.length, 0)])
}

// Uploads a file into a conversation as `agent`.
export function upload(agent, conversationId, buffer, filename) {
  return agent.post(`/api/conversations/${conversationId}/attachments`).attach('file', buffer, filename)
}
