import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { env } from '../src/config/env.js'
import { AiError, RETRY_PAUSE_MS, createImage, streamReply } from '../src/services/geminiClient.js'

// geminiClient.js is the one file that talks to Google. Here Google's own
// SDK is replaced with a fake, so these tests check OUR handling of what it
// returns - streaming, falling back to another model, turning errors into
// readable reasons - without any network at all.
const sdk = vi.hoisted(() => ({ generateContentStream: vi.fn(), generateContent: vi.fn() }))

vi.mock('@google/genai', async (importOriginal) => ({
  ...(await importOriginal()),
  GoogleGenAI: class {
    constructor() {
      this.models = sdk
    }
  },
}))

// What the SDK's stream yields: one response object per piece.
async function* streamOf(...chunks) {
  for (const chunk of chunks) yield chunk
}
const piece = (text, { thought = false, finishReason } = {}) => ({
  candidates: [{ content: { parts: [thought ? { text, thought: true } : { text }] }, ...(finishReason && { finishReason }) }],
})
const httpError = (status, message = 'error') => Object.assign(new Error(message), { status })

const ask = (overrides = {}) =>
  streamReply({
    contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
    systemInstruction: 'You are PingMe AI.',
    thinkDeeper: false,
    signal: new AbortController().signal,
    onUpdate: () => {},
    ...overrides,
  })

beforeEach(() => {
  env.GEMINI_API_KEY = 'test-key'
  sdk.generateContentStream.mockReset()
  sdk.generateContent.mockReset()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  delete env.GEMINI_API_KEY
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('streamReply', () => {
  it('streams the answer and the reasoning, reporting the WHOLE text so far each time', async () => {
    sdk.generateContentStream.mockResolvedValueOnce(
      streamOf(piece('Thinking it over.', { thought: true }), piece('Hello'), piece(' there!', { finishReason: 'STOP' })),
    )
    const updates = []
    const result = await ask({ onUpdate: (u) => updates.push(u) })

    expect(result).toEqual({ text: 'Hello there!', reasoning: 'Thinking it over.', truncated: false })
    expect(updates).toEqual([
      { text: '', reasoning: 'Thinking it over.' },
      { text: 'Hello', reasoning: 'Thinking it over.' },
      { text: 'Hello there!', reasoning: 'Thinking it over.' },
    ])
  })

  it('asks for low reasoning normally, high for "Think deeper", always with a summary', async () => {
    sdk.generateContentStream.mockImplementation(async () => streamOf(piece('ok')))
    await ask()
    await ask({ thinkDeeper: true })

    const [normal, deeper] = sdk.generateContentStream.mock.calls.map(([request]) => request)
    expect(normal.model).toBe(env.GEMINI_MODEL)
    expect(normal.config).toMatchObject({
      systemInstruction: 'You are PingMe AI.',
      thinkingConfig: { thinkingLevel: 'LOW', includeThoughts: true },
    })
    expect(deeper.config.thinkingConfig.thinkingLevel).toBe('HIGH')
  })

  it('when the main model is overloaded, the fallback model answers', async () => {
    sdk.generateContentStream
      .mockRejectedValueOnce(httpError(503, 'This model is currently experiencing high demand.'))
      .mockResolvedValueOnce(streamOf(piece('From the fallback')))
    const result = await ask()

    expect(result.text).toBe('From the fallback')
    expect(sdk.generateContentStream.mock.calls.map(([r]) => r.model)).toEqual([env.GEMINI_MODEL, env.GEMINI_FALLBACK_MODEL])
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('(503)'))
  })

  it('when both are busy, waits a moment and tries the main model once more', async () => {
    vi.useFakeTimers()
    sdk.generateContentStream
      .mockRejectedValueOnce(httpError(503))
      .mockRejectedValueOnce(httpError(429, 'Resource has been exhausted (limit: 15)'))
      .mockResolvedValueOnce(streamOf(piece('Third time lucky')))
    const answer = ask()
    await vi.advanceTimersByTimeAsync(RETRY_PAUSE_MS)

    expect((await answer).text).toBe('Third time lucky')
    expect(sdk.generateContentStream).toHaveBeenCalledTimes(3)
  })

  it('gives up as "busy" after the last try', async () => {
    vi.useFakeTimers()
    sdk.generateContentStream.mockRejectedValue(httpError(503))
    const answer = ask().catch((err) => err)
    await vi.advanceTimersByTimeAsync(RETRY_PAUSE_MS)

    const err = await answer
    expect(err).toBeInstanceOf(AiError)
    expect(err.reason).toBe('busy')
  })

  it.each([
    [httpError(400, 'API key not valid. Please pass a valid API key.'), 'config'],
    [httpError(403, 'Permission denied'), 'config'],
    [httpError(400, 'Unsupported MIME type'), 'bad_request'],
  ])('maps %s to "%s" - without retrying requests that would only fail again', async (error, reason) => {
    sdk.generateContentStream.mockRejectedValueOnce(error)
    await expect(ask()).rejects.toMatchObject({ reason })
    expect(sdk.generateContentStream).toHaveBeenCalledTimes(1)
  })

  it('an answer cut off half-way starts again on the fallback model', async () => {
    sdk.generateContentStream
      .mockResolvedValueOnce(
        (async function* () {
          yield piece('Half an ans')
          throw new Error('Incomplete JSON segment at the end') // what the SDK throws
        })(),
      )
      .mockResolvedValueOnce(streamOf(piece('A whole answer')))
    const updates = []
    const result = await ask({ onUpdate: (u) => updates.push(u) })

    expect(result.text).toBe('A whole answer')
    // The screen goes back to "Thinking..." before the new answer streams in.
    expect(updates).toEqual([
      { text: 'Half an ans', reasoning: '' },
      { text: '', reasoning: '' },
      { text: 'A whole answer', reasoning: '' },
    ])
  })

  it('a network failure (no HTTP status) is retried too, then "busy"', async () => {
    vi.useFakeTimers()
    sdk.generateContentStream.mockRejectedValue(new TypeError('fetch failed'))
    const answer = ask().catch((err) => err)
    await vi.advanceTimersByTimeAsync(RETRY_PAUSE_MS)

    expect((await answer).reason).toBe('busy')
    expect(sdk.generateContentStream).toHaveBeenCalledTimes(3)
  })

  it('a question or answer the safety filters stop is "blocked"', async () => {
    sdk.generateContentStream.mockResolvedValueOnce(streamOf({ promptFeedback: { blockReason: 'SAFETY' } }))
    await expect(ask()).rejects.toMatchObject({ reason: 'blocked' })

    sdk.generateContentStream.mockResolvedValueOnce(streamOf(piece('Here is how'), piece('', { finishReason: 'SAFETY' })))
    await expect(ask()).rejects.toMatchObject({ reason: 'blocked' })
  })

  it('an answer with no text is "empty"; one that hit the length limit is marked truncated', async () => {
    sdk.generateContentStream.mockResolvedValueOnce(streamOf(piece('only thoughts', { thought: true, finishReason: 'MAX_TOKENS' })))
    await expect(ask()).rejects.toMatchObject({ reason: 'empty' })

    sdk.generateContentStream.mockResolvedValueOnce(streamOf(piece('A long answer', { finishReason: 'MAX_TOKENS' })))
    expect(await ask()).toMatchObject({ text: 'A long answer', truncated: true })
  })

  it('Stop (an aborted signal) is passed on as-is, not turned into an error reason', async () => {
    const controller = new AbortController()
    sdk.generateContentStream.mockImplementationOnce(async ({ config }) => {
      expect(config.abortSignal).toBe(controller.signal)
      return (async function* () {
        yield piece('Partly')
        controller.abort()
        throw new DOMException('This operation was aborted', 'AbortError')
      })()
    })
    const err = await ask({ signal: controller.signal }).catch((e) => e)
    expect(err).not.toBeInstanceOf(AiError)
    expect(err.name).toBe('AbortError')
  })
})

describe('createImage', () => {
  const PNG_BASE64 = Buffer.from('fake png bytes').toString('base64')

  it('returns the picture and any text, from the image model', async () => {
    sdk.generateContent.mockResolvedValueOnce({
      candidates: [{ content: { parts: [{ text: 'Here you go' }, { inlineData: { mimeType: 'image/png', data: PNG_BASE64 } }] } }],
    })
    const photo = { buffer: Buffer.from('my photo'), mimeType: 'image/jpeg' }
    const result = await createImage({ prompt: 'make it blue', image: photo, signal: new AbortController().signal })

    expect(result.text).toBe('Here you go')
    expect(result.image.buffer.toString()).toBe('fake png bytes')
    const request = sdk.generateContent.mock.calls[0][0]
    expect(request.model).toBe(env.GEMINI_IMAGE_MODEL)
    expect(request.config.responseModalities).toEqual(['TEXT', 'IMAGE'])
    expect(request.contents[0].parts).toEqual([
      { inlineData: { mimeType: 'image/jpeg', data: photo.buffer.toString('base64') } },
      { text: 'make it blue' },
    ])
  })

  it('a free plan (an image quota of 0) is "unavailable"; no picture back is "no_image"', async () => {
    sdk.generateContent.mockRejectedValueOnce(httpError(429, 'Quota exceeded for metric: ..., limit: 0, model: x'))
    await expect(createImage({ prompt: 'a cat' })).rejects.toMatchObject({ reason: 'unavailable' })

    sdk.generateContent.mockResolvedValueOnce({ candidates: [{ content: { parts: [{ text: 'I cannot draw that' }] } }] })
    await expect(createImage({ prompt: 'a cat' })).rejects.toMatchObject({ reason: 'no_image' })
  })
})
