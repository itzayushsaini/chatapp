import request from 'supertest'
import { describe, expect, it } from 'vitest'

// Supertest starts the app on a random free port for each request, which is
// only possible because app.js exports the app without calling listen().
import app from '../src/app.js'

describe('GET /api/health', () => {
  it('reports that the server is up', async () => {
    const res = await request(app).get('/api/health')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok' })
  })

  it('needs no authentication', async () => {
    // No cookie is sent, and it still succeeds.
    const res = await request(app).get('/api/health')

    expect(res.status).toBe(200)
  })
})

describe('unknown routes', () => {
  it('returns 404 as JSON in the { message } shape', async () => {
    const res = await request(app).get('/api/does-not-exist')

    expect(res.status).toBe(404)
    expect(res.body).toEqual({ message: 'Not found' })
  })
})

describe('malformed request bodies', () => {
  it('returns 400 instead of crashing the server', async () => {
    const res = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{ this is not json')

    expect(res.status).toBe(400)
    expect(typeof res.body.message).toBe('string')
  })
})
