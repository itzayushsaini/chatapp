import { GoogleGenAI, ThinkingLevel } from '@google/genai'

import { env } from '../config/env.js'

// The ONLY file that talks to Google's Gemini API. The rest of the app
// (aiService) passes plain objects in and gets plain objects back, so the
// tests can swap this one file for a fake, and moving to another AI
// provider later would change only this file.

// The longest answer, in tokens (roughly 4 characters each). On Gemini 3 the
// model's thinking counts towards this too.
const MAX_OUTPUT_TOKENS = 8192
// A long, carefully reasoned answer can take a minute or more to stream.
const REQUEST_TIMEOUT_MS = 120_000

// Finish reasons meaning "the safety filters stopped this", not "done".
const BLOCKED = new Set([
  'SAFETY',
  'PROHIBITED_CONTENT',
  'BLOCKLIST',
  'SPII',
  'RECITATION',
  'IMAGE_SAFETY',
  'IMAGE_PROHIBITED_CONTENT',
  'IMAGE_RECITATION',
])

// Every failure leaves this file as an AiError, with a `reason` the rest of
// the app can act on without knowing anything about Google's error format:
//   'busy'        - overloaded, or out of quota for now: try again later
//   'unavailable' - not on this server's Gemini plan at all (quota of 0)
//   'blocked'     - Gemini's safety filters refused the question or answer
//   'config'      - the API key is wrong; only an admin can fix that
//   'bad_request' - Gemini could not handle what was sent (e.g. a broken file)
//   'empty'       - it finished without writing any answer
//   'no_image'    - "create a picture" came back without a picture
export class AiError extends Error {
  constructor(reason) {
    super(`Gemini request failed: ${reason}`)
    this.reason = reason
  }
}

export function isConfigured() {
  return Boolean(env.GEMINI_API_KEY)
}

// Created on first use, so a server without a key never builds one.
let client = null
function gemini() {
  client ??= new GoogleGenAI({ apiKey: env.GEMINI_API_KEY, httpOptions: { timeout: REQUEST_TIMEOUT_MS } })
  return client
}

// Turns whatever the SDK threw into an AiError. The SDK's ApiError carries
// the HTTP status; a network failure has none.
function toAiError(err) {
  if (err instanceof AiError) return err
  const status = err?.status
  const details = String(err?.message ?? '')
  if (status === 429) return new AiError(/limit: 0\b/.test(details) ? 'unavailable' : 'busy')
  if (status === 401 || status === 403 || /API key/i.test(details)) return new AiError('config')
  if (status === 400) return new AiError('bad_request')
  return new AiError('busy') // 5xx, timeouts, network errors - Google's side
}

// One line in the server log per failed request: which model, which HTTP
// status, and Google's own message. Never the question or the key (the key
// travels in a request header, and errors do not include it).
function logFailure(model, err) {
  const details = String(err?.message ?? err).replace(/\s+/g, ' ').slice(0, 200)
  console.warn(`Gemini request to ${model} failed (${err?.status ?? 'no HTTP status'}): ${details}`)
}

// Worth another try: 429 (this model's quota is used up for now), 5xx
// (overloaded), or no HTTP status at all - the connection dropped, or the
// stream was cut off half-way. A bad request or a wrong key would only fail
// the same way again.
const worthRetrying = (err) => !err?.status || err.status === 429 || err.status >= 500

// Busy spells on the free tier usually last only seconds, so when a request
// fails that way: try the fallback model straight away (separate capacity
// and quota), then - after a short pause - the main model one last time.
export const RETRY_PAUSE_MS = 2000
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function modelsToTry() {
  const { GEMINI_MODEL: main, GEMINI_FALLBACK_MODEL: fallback } = env
  return fallback && fallback !== main ? [main, fallback, main] : [main, main]
}

// Streams an answer to a conversation.
//
// `contents` is the conversation in Gemini's own format:
//   [{ role: 'user' | 'model', parts: [{ text } | { inlineData: { mimeType, data } }] }]
// `onUpdate({ text, reasoning })` is called every time more arrives, with the
// WHOLE answer (and reasoning) so far - not just the new piece.
//
// Resolves to { text, reasoning, truncated }, or throws an AiError. If
// `signal` is aborted (the Stop button) it throws whatever fetch threw; the
// caller checks signal.aborted to tell that apart from a real failure.
export async function streamReply({ contents, systemInstruction, thinkDeeper, signal, onUpdate }) {
  const config = {
    systemInstruction,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    // How hard the model thinks before answering. includeThoughts asks for a
    // readable summary of that thinking - the "Show reasoning" text.
    thinkingConfig: {
      thinkingLevel: thinkDeeper ? ThinkingLevel.HIGH : ThinkingLevel.LOW,
      includeThoughts: true,
    },
    abortSignal: signal,
  }

  const attempts = modelsToTry()
  let shownSomething = false
  for (const [i, model] of attempts.entries()) {
    const isLast = i === attempts.length - 1
    if (isLast) await sleep(RETRY_PAUSE_MS)
    // A try after one that was cut off half-way starts the answer again.
    if (shownSomething) onUpdate({ text: '', reasoning: '' })
    try {
      return await streamFrom(model, contents, config, (partial) => {
        shownSomething = true
        onUpdate(partial)
      })
    } catch (err) {
      if (signal?.aborted) throw err
      // Blocked or empty: Gemini answered properly - another try won't help.
      if (err instanceof AiError) throw err
      logFailure(model, err)
      if (isLast || !worthRetrying(err)) throw toAiError(err)
    }
  }
}

// One attempt, on one model.
async function streamFrom(model, contents, config, onUpdate) {
  // Resolves once Google has accepted the request - an HTTP error such as
  // 503 is thrown here, before any of the answer has arrived.
  const stream = await gemini().models.generateContentStream({ model, contents, config })

  let text = ''
  let reasoning = ''
  let finishReason = null
  for await (const chunk of stream) {
    if (chunk.promptFeedback?.blockReason) throw new AiError('blocked')
    const candidate = chunk.candidates?.[0]
    let changed = false
    for (const part of candidate?.content?.parts ?? []) {
      if (!part.text) continue
      // A part marked `thought` is reasoning, anything else is the answer.
      if (part.thought) reasoning += part.text
      else text += part.text
      changed = true
    }
    if (candidate?.finishReason) finishReason = candidate.finishReason
    if (changed) onUpdate({ text, reasoning })
  }

  if (BLOCKED.has(finishReason)) throw new AiError('blocked')
  // e.g. all of the length limit went on thinking, leaving none for the answer.
  if (!text.trim()) throw new AiError('empty')
  return { text, reasoning, truncated: finishReason === 'MAX_TOKENS' }
}

// Creates a picture from a description - optionally changing a photo the
// user sent (`image` = { buffer, mimeType }). Resolves to
// { text, image: { buffer, mimeType } | null }.
//
// Not streamed: an image arrives whole. Image models are paid-only, which is
// why an admin has to switch this on.
export async function createImage({ prompt, image, signal }) {
  const parts = [{ text: prompt }]
  if (image) parts.unshift({ inlineData: { mimeType: image.mimeType, data: image.buffer.toString('base64') } })

  let response
  try {
    response = await gemini().models.generateContent({
      model: env.GEMINI_IMAGE_MODEL,
      contents: [{ role: 'user', parts }],
      config: { responseModalities: ['TEXT', 'IMAGE'], abortSignal: signal },
    })
  } catch (err) {
    if (signal?.aborted) throw err
    logFailure(env.GEMINI_IMAGE_MODEL, err)
    throw toAiError(err)
  }

  const candidate = response.candidates?.[0]
  if (response.promptFeedback?.blockReason || BLOCKED.has(candidate?.finishReason)) {
    throw new AiError('blocked')
  }

  let text = ''
  let picture = null
  for (const part of candidate?.content?.parts ?? []) {
    if (part.thought) continue
    if (part.inlineData?.data && !picture) {
      picture = { buffer: Buffer.from(part.inlineData.data, 'base64'), mimeType: part.inlineData.mimeType }
    } else if (part.text) {
      text += part.text
    }
  }
  if (!picture) throw new AiError('no_image')
  return { text, image: picture }
}
