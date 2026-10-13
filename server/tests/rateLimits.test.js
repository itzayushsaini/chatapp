import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import app from '../src/app.js'

// limits are off under NODE_ENV=test; this file turns them back on (each test file runs isolated)
beforeAll(() => vi.stubEnv('ENABLE_RATE_LIMITS', 'true'))
afterAll(() => vi.unstubAllEnvs())

describe('login rate limit', () => {
  it('allows 10 attempts per 15 minutes, then returns 429', async () => {
    const attempt = () =>
      request(app).post('/api/auth/login').send({ identifier: 'nobody', password: 'x' })

    for (let i = 0; i < 10; i++) {
      const res = await attempt()
      expect(res.status).toBe(401)
    }

    const blocked = await attempt()
    expect(blocked.status).toBe(429)
    expect(typeof blocked.body.message).toBe('string')
  })
})
