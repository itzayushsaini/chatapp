import request from 'supertest'
import { describe, expect, it } from 'vitest'

import app from '../src/app.js'
import { sentEmails } from '../src/services/emailService.js'
import { User } from '../src/models/User.js'
import { registerUser } from './helpers.js'

const PASSWORD = 'password123'

// Pulls the ?token=...&email=... out of the reset link inside the last
// email sent - emailService captures every email here in test mode instead
// of calling Brevo, so this never touches the real network.
function lastResetLink() {
  const email = sentEmails.at(-1)
  const match = /\/reset-password\?token=([a-f0-9]{64})&email=([^"'<>\s]+)/.exec(email.html)
  return { token: match[1], email: decodeURIComponent(match[2]) }
}

describe('POST /api/auth/forgot-password', () => {
  it('emails a reset link for a real account', async () => {
    await registerUser('aman')
    const before = sentEmails.length

    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'aman@example.com' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      message: "If an account exists for that email, we've sent a password reset link.",
    })
    expect(sentEmails).toHaveLength(before + 1)
    expect(sentEmails.at(-1).to).toBe('aman@example.com')
    expect(sentEmails.at(-1).html).toContain('/reset-password?token=')
  })

  it('gives the identical response for an email that does not exist, and sends nothing', async () => {
    const before = sentEmails.length

    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'nobody@example.com' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      message: "If an account exists for that email, we've sent a password reset link.",
    })
    expect(sentEmails).toHaveLength(before)
  })

  it('rejects an invalid email with 400', async () => {
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'not-an-email' })
    expect(res.status).toBe(400)
  })
})

describe('POST /api/auth/reset-password', () => {
  it('resets the password: old password stops working, new one works', async () => {
    await registerUser('aman')
    await request(app).post('/api/auth/forgot-password').send({ email: 'aman@example.com' })
    const { token, email } = lastResetLink()

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ email, token, password: 'new-password-456' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ message: 'Password updated. Please log in.' })

    const oldLogin = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'aman', password: PASSWORD })
    expect(oldLogin.status).toBe(401)

    const newLogin = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'aman', password: 'new-password-456' })
    expect(newLogin.status).toBe(200)
  })

  it('cannot be used twice', async () => {
    await registerUser('aman')
    await request(app).post('/api/auth/forgot-password').send({ email: 'aman@example.com' })
    const { token, email } = lastResetLink()

    const first = await request(app)
      .post('/api/auth/reset-password')
      .send({ email, token, password: 'new-password-456' })
    const second = await request(app)
      .post('/api/auth/reset-password')
      .send({ email, token, password: 'another-password-789' })

    expect(first.status).toBe(200)
    expect(second.status).toBe(400)
    expect(second.body).toEqual({ message: 'That reset link is invalid or has expired' })
  })

  it('rejects a wrong token, an expired one, and an unknown email', async () => {
    await registerUser('aman')
    await request(app).post('/api/auth/forgot-password').send({ email: 'aman@example.com' })
    const { token, email } = lastResetLink()

    const wrongToken = await request(app)
      .post('/api/auth/reset-password')
      .send({ email, token: 'f'.repeat(64), password: 'new-password-456' })
    expect(wrongToken.status).toBe(400)

    await User.updateOne({ email }, { resetPasswordExpires: new Date(Date.now() - 1000) })
    const expired = await request(app)
      .post('/api/auth/reset-password')
      .send({ email, token, password: 'new-password-456' })
    expect(expired.status).toBe(400)

    const unknownEmail = await request(app)
      .post('/api/auth/reset-password')
      .send({ email: 'nobody@example.com', token, password: 'new-password-456' })
    expect(unknownEmail.status).toBe(400)
  })

  it('rejects a malformed token and a short password with 400', async () => {
    const short = await request(app)
      .post('/api/auth/reset-password')
      .send({ email: 'aman@example.com', token: 'not-a-real-token', password: 'new-password-456' })
    expect(short.status).toBe(400)

    const shortPassword = await request(app)
      .post('/api/auth/reset-password')
      .send({ email: 'aman@example.com', token: 'f'.repeat(64), password: 'short' })
    expect(shortPassword.status).toBe(400)
  })

  it('logs out every device once the reset completes', async () => {
    const { cookie } = await registerUser('aman')
    await request(app).post('/api/auth/forgot-password').send({ email: 'aman@example.com' })
    const { token, email } = lastResetLink()

    await request(app).post('/api/auth/reset-password').send({ email, token, password: 'new-password-456' })

    const res = await request(app).get('/api/auth/me').set('Cookie', cookie)
    expect(res.status).toBe(401)
  })
})

describe('PATCH /api/auth/password', () => {
  it('changes the password and keeps the current tab logged in', async () => {
    const { agent } = await registerUser('aman')

    const res = await agent
      .patch('/api/auth/password')
      .send({ currentPassword: PASSWORD, newPassword: 'new-password-456' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ message: 'Password changed. Your other devices have been logged out.' })
    // A fresh cookie was issued - this same agent is still logged in.
    expect((await agent.get('/api/auth/me')).status).toBe(200)

    const oldLogin = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'aman', password: PASSWORD })
    expect(oldLogin.status).toBe(401)
  })

  it('logs out every OTHER device, but not this one', async () => {
    const { agent, cookie: otherDeviceCookie } = await registerUser('aman')

    await agent.patch('/api/auth/password').send({ currentPassword: PASSWORD, newPassword: 'new-password-456' })

    expect((await agent.get('/api/auth/me')).status).toBe(200)
    expect((await request(app).get('/api/auth/me').set('Cookie', otherDeviceCookie)).status).toBe(401)
  })

  it('returns 400 for the wrong current password, and nothing changes', async () => {
    const { agent } = await registerUser('aman')

    const res = await agent
      .patch('/api/auth/password')
      .send({ currentPassword: 'totally-wrong', newPassword: 'new-password-456' })

    // 400, not 401 - a wrong current password must never be treated by the
    // client as an expired session and trigger an auto logout.
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ message: 'Current password is incorrect' })
    expect((await request(app).post('/api/auth/login').send({ identifier: 'aman', password: PASSWORD })).status).toBe(200)
  })

  it('rejects a new password same as the current one', async () => {
    const { agent } = await registerUser('aman')

    const res = await agent
      .patch('/api/auth/password')
      .send({ currentPassword: PASSWORD, newPassword: PASSWORD })

    expect(res.status).toBe(400)
  })

  it('rejects a new password that is too short', async () => {
    const { agent } = await registerUser('aman')
    const res = await agent.patch('/api/auth/password').send({ currentPassword: PASSWORD, newPassword: 'short' })
    expect(res.status).toBe(400)
  })

  it('requires login', async () => {
    const res = await request(app)
      .patch('/api/auth/password')
      .send({ currentPassword: PASSWORD, newPassword: 'new-password-456' })
    expect(res.status).toBe(401)
  })
})
