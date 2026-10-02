import { http } from './http.js'

// PingMe AI - each user's own private chat with the assistant.

// { available, imageGeneration, dailyLimit, usedToday, latest }
export const getAiSummary = () => http.get('/ai/summary').then((r) => r.data)

// Without `before`: the latest page. With `before`: the page older than that
// message. Resolves to { messages, hasMore }, oldest -> newest.
export const getAiMessages = (before) =>
  http.get('/ai/messages', { params: before ? { before } : {} }).then((r) => r.data)

// Asks a question, with an optional file. The ANSWER is not in the response:
// it streams in over the socket (ai:delta, then ai:done). Resolves to
// { question, answer }, the answer still empty with status 'streaming'.
// `mode` is 'chat', 'think' ("Think deeper") or 'imagine' (create a picture).
export function askAi({ text, clientId, mode, file, voice }, onProgress) {
  const form = new FormData()
  form.append('text', text)
  form.append('clientId', clientId)
  form.append('mode', mode)
  if (voice) {
    form.append('durationMs', String(Math.round(voice.durationMs)))
    form.append('waveform', JSON.stringify(voice.waveform))
  }
  if (file) form.append('file', file)
  return http
    .post('/ai/messages', form, {
      onUploadProgress: (event) => {
        if (event.total) onProgress?.(event.loaded / event.total)
      },
    })
    .then((r) => r.data)
}

// A message from a friend chat, sent to PingMe AI as a question.
export const forwardToAi = (messageId, clientId) =>
  http.post('/ai/forward', { messageId, clientId }).then((r) => r.data)

// "Try again" on the latest answer, when it failed.
export const retryAi = () => http.post('/ai/retry').then((r) => r.data.answer)
export const stopAi = () => http.post('/ai/stop')
export const clearAi = () => http.delete('/ai/messages')
