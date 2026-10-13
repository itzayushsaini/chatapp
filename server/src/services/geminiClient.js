import { GoogleGenAI, ThinkingLevel } from '@google/genai'

import { env } from '../config/env.js'

// On Gemini 3 the model's thinking counts towards this limit too
const MAX_OUTPUT_TOKENS = 8192
const REQUEST_TIMEOUT_MS = 120_000

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

export class AiError extends Error {
  constructor(reason) {
    super(`Gemini request failed: ${reason}`)
    this.reason = reason
  }
}

export function isConfigured() {
  return Boolean(env.GEMINI_API_KEY)
}

let client = null
function gemini() {
  client ??= new GoogleGenAI({ apiKey: env.GEMINI_API_KEY, httpOptions: { timeout: REQUEST_TIMEOUT_MS } })
  return client
}

function toAiError(err) {
  if (err instanceof AiError) return err
  const status = err?.status
  const details = String(err?.message ?? '')
  // "limit: 0" means this model isn't on the server's Gemini plan at all
  if (status === 429) return new AiError(/limit: 0\b/.test(details) ? 'unavailable' : 'busy')
  if (status === 401 || status === 403 || /API key/i.test(details)) return new AiError('config')
  if (status === 400) return new AiError('bad_request')
  return new AiError('busy')
}

// Never logs the question or the key (the key is in a header, not in errors)
function logFailure(model, err) {
  const details = String(err?.message ?? err).replace(/\s+/g, ' ').slice(0, 200)
  console.warn(`Gemini request to ${model} failed (${err?.status ?? 'no HTTP status'}): ${details}`)
}

// No status means the connection or stream dropped; 400/401 would just fail again
const worthRetrying = (err) => !err?.status || err.status === 429 || err.status >= 500

// Busy spells are short: try the fallback model, then the main one again after a pause
export const RETRY_PAUSE_MS = 2000
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function modelsToTry() {
  const { GEMINI_MODEL: main, GEMINI_FALLBACK_MODEL: fallback } = env
  return fallback && fallback !== main ? [main, fallback, main] : [main, main]
}

export async function streamReply({ contents, systemInstruction, thinkDeeper, signal, onUpdate }) {
  const config = {
    systemInstruction,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
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
    if (shownSomething) onUpdate({ text: '', reasoning: '' })
    try {
      return await streamFrom(model, contents, config, (partial) => {
        shownSomething = true
        onUpdate(partial)
      })
    } catch (err) {
      if (signal?.aborted) throw err
      if (err instanceof AiError) throw err
      logFailure(model, err)
      if (isLast || !worthRetrying(err)) throw toAiError(err)
    }
  }
}

async function streamFrom(model, contents, config, onUpdate) {
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
      if (part.thought) reasoning += part.text
      else text += part.text
      changed = true
    }
    if (candidate?.finishReason) finishReason = candidate.finishReason
    if (changed) onUpdate({ text, reasoning })
  }

  if (BLOCKED.has(finishReason)) throw new AiError('blocked')
  if (!text.trim()) throw new AiError('empty')
  return { text, reasoning, truncated: finishReason === 'MAX_TOKENS' }
}

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
